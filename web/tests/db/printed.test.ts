import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { SEED, asService, asUser, book, connect, createEvent, createUser, expectTL, items, rpc } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

const design = (over: Record<string, unknown> = {}, qr: Record<string, unknown> = {}, brand: Record<string, unknown> = {}) => ({
  version: 1,
  width: 1800,
  height: 650,
  background: "#ffffff",
  layers: [
    { id: "t", type: "text", x: 40, y: 40, width: 800, text: "{{event_name}}", fontSize: 60 },
    { id: "qr", type: "qr", x: 1400, y: 150, size: 300, ...qr },
    { id: "brand", type: "brand", x: 40, y: 560, width: 300, height: 60, ...brand },
  ],
  ...over,
});

type BatchResult = { batch_id: string; first_serial: number; last_serial: number; quantity: number };

const createBatch = (eventId: string, typeId: string, qty: number, opts: { user?: string; prefix?: string; d?: unknown } = {}) =>
  asUser(c, opts.user ?? SEED.organizer, () =>
    rpc<BatchResult>(c, "create_print_batch", [eventId, typeId, qty, opts.prefix ?? "QWL", JSON.stringify(opts.d ?? design()), "qawwali-classic", "Gate sale"], [
      "uuid", "uuid", "int", "text", "jsonb", "text", "text",
    ]),
  );

const checkIn = (ticketId: string, eventId: string) =>
  asService(c, () =>
    rpc<{ result: string; serial?: string; holder_name?: string }>(c, "perform_check_in", [ticketId, eventId, SEED.organizer, "scan", "test"], [
      "uuid", "uuid", "uuid", "checkin_method", "text",
    ]),
  );

describe("printed tickets (PRT-02 .. PRT-04)", () => {
  it("creates N tickets with consecutive serials and unique codes", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 200000, quantity: 500 }]);
    const r = await createBatch(eventId, typeIds[0], 100);
    expect(r).toMatchObject({ first_serial: 1, last_serial: 100, quantity: 100 });
    const t = await c.query(
      "select count(*)::int n, count(distinct code)::int codes, min(serial_no) mn, max(serial_no) mx, bool_and(source = 'printed') p, bool_and(order_id is null and owner_id is null) noowner from public.tickets where batch_id = $1",
      [r.batch_id],
    );
    expect(t.rows[0]).toMatchObject({ n: 100, codes: 100, mn: 1, mx: 100, p: true, noowner: true });
    const audit = await c.query("select count(*)::int n from public.audit_log where action = 'print_batch.create' and details->>'batch_id' = $1", [r.batch_id]);
    expect(audit.rows[0].n).toBe(1);
  });

  it("continues serial numbers in the next batch of the same event", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 100 }, { quantity: 100 }]);
    await createBatch(eventId, typeIds[0], 10);
    const second = await createBatch(eventId, typeIds[1], 5, { prefix: "vip" });
    expect(second.first_serial).toBe(11);
    expect(second.last_serial).toBe(15);
    const label = await c.query("select public.print_serial_label(prefix, first_serial) l from public.print_batches where id = $1", [second.batch_id]);
    expect(label.rows[0].l).toBe("VIP-0011");
  });

  it("uses up the ticket type quantity – online buyers can't oversell", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    await createBatch(eventId, typeIds[0], 8);
    const avail = await asUser(c, SEED.student, () => c.query("select remaining from public.event_availability($1)", [eventId]));
    expect(avail.rows[0].remaining).toBe(2);
    const u = await createUser(c);
    await expectTL(book(c, u.id, eventId, items([typeIds[0], 3])), "SOLD_OUT");
    await book(c, u.id, eventId, items([typeIds[0], 2]));
    await expectTL(createBatch(eventId, typeIds[0], 1), "SOLD_OUT");
  });

  it("only lets organizers of a published, upcoming event print", async () => {
    const pub = await createEvent(c, [{ quantity: 10 }]);
    await expectTL(createBatch(pub.eventId, pub.typeIds[0], 1, { user: SEED.student }), "FORBIDDEN");
    await expectTL(createBatch(pub.eventId, pub.typeIds[0], 1, { user: SEED.scanner }), "FORBIDDEN");
    const draft = await createEvent(c, [{ quantity: 10 }], { status: "draft" });
    await expectTL(createBatch(draft.eventId, draft.typeIds[0], 1), "INVALID_STATE");
    await expectTL(createBatch(pub.eventId, pub.typeIds[0], 0), "INVALID_ITEMS");
    await expectTL(createBatch(pub.eventId, pub.typeIds[0], 2001), "INVALID_ITEMS");
    await expectTL(createBatch(pub.eventId, pub.typeIds[0], 1, { prefix: "TOO-LONG!" }), "INVALID_ITEMS");
    const other = await createEvent(c, [{ quantity: 10 }]);
    await expectTL(createBatch(pub.eventId, other.typeIds[0], 1), "INVALID_ITEMS");
  });

  it("refuses designs without the QR or the TickLO logo", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const noQr = design({ layers: [{ id: "brand", type: "brand", x: 40, y: 560, width: 300, height: 60 }] });
    await expectTL(createBatch(eventId, typeIds[0], 1, { d: noQr }), "INVALID_DESIGN");
    const noBrand = design({ layers: [{ id: "qr", type: "qr", x: 1400, y: 150, size: 300 }] });
    await expectTL(createBatch(eventId, typeIds[0], 1, { d: noBrand }), "INVALID_DESIGN");
    await expectTL(createBatch(eventId, typeIds[0], 1, { d: design({}, { size: 120 }) }), "INVALID_DESIGN");
    await expectTL(createBatch(eventId, typeIds[0], 1, { d: design({}, { x: 1700 }) }), "INVALID_DESIGN");
    await expectTL(createBatch(eventId, typeIds[0], 1, { d: design({}, { hidden: true }) }), "INVALID_DESIGN");
    await expectTL(createBatch(eventId, typeIds[0], 1, { d: design({}, {}, { width: 100 }) }), "INVALID_DESIGN");
    await expectTL(createBatch(eventId, typeIds[0], 1, { d: design({}, {}, { opacity: 0.2 }) }), "INVALID_DESIGN");
    const t = await c.query("select count(*)::int n from public.tickets where event_id = $1", [eventId]);
    expect(t.rows[0].n).toBe(0);
  });

  it("locks the price once tickets are printed", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 100000, quantity: 20 }]);
    await createBatch(eventId, typeIds[0], 5);
    await expectTL(
      asUser(c, SEED.organizer, () => c.query("update public.ticket_types set price_paisa = 50000 where id = $1", [typeIds[0]])),
      "PRICE_LOCKED",
    );
    await expectTL(
      asUser(c, SEED.organizer, () => c.query("update public.ticket_types set quantity = 4 where id = $1", [typeIds[0]])),
      "QUANTITY_TOO_LOW",
    );
    await expectTL(asUser(c, SEED.organizer, () => c.query("delete from public.ticket_types where id = $1", [typeIds[0]])), "HAS_BOOKINGS");
  });
});

describe("printed tickets at the gate (PRT-07, PRT-09)", () => {
  it("scans once, then 'already used' – with the serial", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const b = await createBatch(eventId, typeIds[0], 3);
    const t = await c.query("select id from public.tickets where batch_id = $1 and serial_no = 2", [b.batch_id]);
    const first = await checkIn(t.rows[0].id, eventId);
    expect(first).toMatchObject({ result: "ok", serial: "QWL-0002", holder_name: "Printed ticket" });
    const second = await checkIn(t.rows[0].id, eventId);
    expect(second).toMatchObject({ result: "already_used", serial: "QWL-0002" });
  });

  it("voids a serial range: scans say cancelled and places come back", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const b = await createBatch(eventId, typeIds[0], 10);
    const used = await c.query("select id from public.tickets where batch_id = $1 and serial_no = 5", [b.batch_id]);
    await checkIn(used.rows[0].id, eventId);

    await expectTL(
      asUser(c, SEED.organizer, () => rpc(c, "void_printed_tickets", [b.batch_id, 4, 6, " "], ["uuid", "int", "int", "text"])),
      "REASON_REQUIRED",
    );
    await expectTL(
      asUser(c, SEED.organizer, () => rpc(c, "void_printed_tickets", [b.batch_id, 9, 12, "lost"], ["uuid", "int", "int", "text"])),
      "INVALID_ITEMS",
    );
    await expectTL(
      asUser(c, SEED.student, () => rpc(c, "void_printed_tickets", [b.batch_id, 4, 6, "lost"], ["uuid", "int", "int", "text"])),
      "FORBIDDEN",
    );
    const n = await asUser(c, SEED.organizer, () =>
      rpc<number>(c, "void_printed_tickets", [b.batch_id, 4, 6, "Seller lost them"], ["uuid", "int", "int", "text"]),
    );
    expect(n).toBe(2); // #5 was already used and stays used

    const voided = await c.query("select id from public.tickets where batch_id = $1 and serial_no = 4", [b.batch_id]);
    expect((await checkIn(voided.rows[0].id, eventId)).result).toBe("cancelled");
    const avail = await asUser(c, SEED.organizer, () => c.query("select remaining from public.event_availability($1)", [eventId]));
    expect(avail.rows[0].remaining).toBe(2);
  });

  it("finds printed tickets by serial in the scanner list and records the buyer", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const b = await createBatch(eventId, typeIds[0], 2);
    const list = await asUser(c, SEED.organizer, () => c.query("select serial, holder_name from public.scanner_attendees($1)", [eventId]));
    expect(list.rows.map((r) => r.serial).sort()).toEqual(["QWL-0001", "QWL-0002"]);

    const t = await c.query("select id from public.tickets where batch_id = $1 and serial_no = 1", [b.batch_id]);
    await asUser(c, SEED.organizer, () => rpc(c, "set_printed_ticket_buyer", [t.rows[0].id, "Ali Raza", "03001234567"], ["uuid", "text", "text"]));
    let row = await c.query("select holder_name, holder_phone from public.tickets where id = $1", [t.rows[0].id]);
    expect(row.rows[0]).toEqual({ holder_name: "Ali Raza", holder_phone: "03001234567" });
    await asUser(c, SEED.organizer, () => rpc(c, "set_printed_ticket_buyer", [t.rows[0].id, "", null], ["uuid", "text", "text"]));
    row = await c.query("select holder_name, holder_phone from public.tickets where id = $1", [t.rows[0].id]);
    expect(row.rows[0]).toEqual({ holder_name: "Printed ticket", holder_phone: null });
    await expectTL(
      asUser(c, SEED.student, () => rpc(c, "set_printed_ticket_buyer", [t.rows[0].id, "X", null], ["uuid", "text", "text"])),
      "FORBIDDEN",
    );
  });

  it("counts printed tickets in the event stats and logs downloads", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const b = await createBatch(eventId, typeIds[0], 4);
    const stats = await asUser(c, SEED.organizer, () =>
      rpc<{ printed_tickets: number; total_tickets: number; by_type: { printed: number }[] }>(c, "event_stats", [eventId], ["uuid"]),
    );
    expect(stats.printed_tickets).toBe(4);
    expect(stats.total_tickets).toBe(4);
    expect(stats.by_type[0].printed).toBe(4);

    await asUser(c, SEED.organizer, () => rpc(c, "record_print_download", [b.batch_id, "a4"], ["uuid", "text"]));
    const pb = await c.query("select download_count from public.print_batches where id = $1", [b.batch_id]);
    expect(pb.rows[0].download_count).toBe(1);
  });

  it("hides batches and templates from other people (RLS)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const b = await createBatch(eventId, typeIds[0], 1);
    const own = await asUser(c, SEED.organizer, () => c.query("select id from public.print_batches where id = $1", [b.batch_id]));
    expect(own.rowCount).toBe(1);
    const other = await asUser(c, SEED.student, () => c.query("select id from public.print_batches where id = $1", [b.batch_id]));
    expect(other.rowCount).toBe(0);

    await asUser(c, SEED.organizer, () =>
      c.query("insert into public.ticket_templates (org_id, name, design, created_by) values ($1, 'Mine', $2, $3)", [SEED.org, JSON.stringify(design()), SEED.organizer]),
    );
    const seen = await asUser(c, SEED.student, () => c.query("select id from public.ticket_templates where org_id = $1", [SEED.org]));
    expect(seen.rowCount).toBe(0);
    await expect(
      asUser(c, SEED.student, () =>
        c.query("insert into public.ticket_templates (org_id, name, design, created_by) values ($1, 'X', '{}', $2)", [SEED.org, SEED.student]),
      ),
    ).rejects.toThrow();
  });
});
