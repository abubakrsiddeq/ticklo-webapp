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

const design = {
  version: 1,
  width: 1800,
  height: 650,
  background: "#ffffff",
  layers: [
    { id: "qr", type: "qr", x: 1050, y: 70, size: 290 },
    { id: "brand", type: "brand", x: 1050, y: 490, width: 290, height: 102 },
  ],
};

async function setup(qty: number, price = 200000) {
  const ev = await createEvent(c, [{ price, quantity: 500 }]);
  const b = await asUser(c, SEED.organizer, () =>
    rpc<{ batch_id: string }>(c, "create_print_batch", [ev.eventId, ev.typeIds[0], qty, "QWL", JSON.stringify(design), null, null], [
      "uuid", "uuid", "int", "text", "jsonb", "text", "text",
    ]),
  );
  return { ...ev, batchId: b.batch_id };
}

const org = <T>(fn: () => Promise<T>) => asUser(c, SEED.organizer, fn);
const seller = (eventId: string, name: string, userId: string | null = null) =>
  org(() => rpc<string>(c, "save_print_seller", [eventId, null, name, "03001234567", userId], ["uuid", "uuid", "text", "text", "uuid"]));
const assign = (eventId: string, sellerId: string | null, from: number, to: number) =>
  org(() => rpc<number>(c, "assign_printed_tickets", [eventId, sellerId, from, to], ["uuid", "uuid", "int", "int"]));
const sell = (user: string, eventId: string, from: number, to: number, method = "cash", comp = false) =>
  asUser(c, user, () => rpc<number>(c, "mark_printed_sold", [eventId, from, to, method, comp, null, null], ["uuid", "int", "int", "text", "bool", "text", "text"]));
const ticketId = async (eventId: string, serial: number) =>
  (await c.query("select id from public.tickets where event_id = $1 and serial_no = $2", [eventId, serial])).rows[0].id as string;
const scan = async (eventId: string, serial: number) =>
  asService(c, async () =>
    rpc<{ result: string }>(c, "perform_check_in", [await ticketId(eventId, serial), eventId, SEED.organizer, "scan", "t"], ["uuid", "uuid", "uuid", "checkin_method", "text"]),
  );
const stats = (eventId: string) =>
  org(() =>
    rpc<{ printed_sold: number; printed_comp: number; printed_revenue_paisa: number; printed_cash_paisa: number; by_type: { printed_sold: number }[] }>(
      c, "event_stats", [eventId], ["uuid"],
    ),
  );

describe("printed ticket sales (SAL-01 .. SAL-08)", () => {
  it("handles the 50 printed / 40 sold / 38 scanned / 10 returned example", async () => {
    const { eventId } = await setup(50);
    const ali = await seller(eventId, "Ali");
    expect(await assign(eventId, ali, 1, 50)).toBe(50);

    // Ali sells 35 by range (cash), 3 by JazzCash, and 2 more are only found at the gate
    expect(await sell(SEED.organizer, eventId, 1, 35)).toBe(35);
    expect(await sell(SEED.organizer, eventId, 36, 38, "jazzcash")).toBe(3);
    for (let s = 1; s <= 36; s++) expect((await scan(eventId, s)).result).toBe("ok");
    expect((await scan(eventId, 39)).result).toBe("ok");
    expect((await scan(eventId, 40)).result).toBe("ok");
    const gate = await c.query("select sale_status, sale_source, sale_price_paisa from public.tickets where event_id = $1 and serial_no = 40", [eventId]);
    expect(gate.rows[0]).toEqual({ sale_status: "sold", sale_source: "scan", sale_price_paisa: 200000 });

    // 10 come back unsold: dead at the gate, places back on sale
    expect(await org(() => rpc<number>(c, "return_printed_tickets", [eventId, 41, 50, "unsold"], ["uuid", "int", "int", "text"]))).toBe(10);
    const r = await scan(eventId, 45);
    expect(r.result).toBe("cancelled");

    // Cash: Ali hands over Rs 78,000
    await org(() => rpc(c, "add_print_cash", [eventId, ali, 7800000, "cash", "first part"], ["uuid", "uuid", "int8", "text", "text"]));

    const st = await stats(eventId);
    expect(st.printed_sold).toBe(40);
    expect(Number(st.printed_revenue_paisa)).toBe(40 * 200000);
    expect(Number(st.printed_cash_paisa)).toBe(7800000);
    expect(st.by_type[0].printed_sold).toBe(40);
    const avail = await org(() => c.query("select remaining from public.event_availability($1)", [eventId]));
    expect(avail.rows[0].remaining).toBe(500 - 40);

    // Settle → locked
    await org(() => rpc(c, "settle_print_seller", [ali, true], ["uuid", "bool"]));
    await expectTL(org(() => rpc(c, "add_print_cash", [eventId, ali, 200000, "cash", null], ["uuid", "uuid", "int8", "text", "text"])), "SETTLED");
    await expectTL(org(() => rpc(c, "undo_printed_sale", [eventId, 1, 2], ["uuid", "int", "int"])), "SETTLED");
    await org(() => rpc(c, "settle_print_seller", [ali, false], ["uuid", "bool"]));
    await org(() => rpc(c, "add_print_cash", [eventId, ali, 200000, "cash", "rest"], ["uuid", "uuid", "int8", "text", "text"]));
    expect(Number((await stats(eventId)).printed_cash_paisa)).toBe(8000000);
  });

  it("free passes count as used but not as revenue", async () => {
    const { eventId } = await setup(5);
    expect(await sell(SEED.organizer, eventId, 1, 2, "cash", true)).toBe(2);
    expect((await scan(eventId, 1)).result).toBe("ok");
    const st = await stats(eventId);
    expect(st.printed_comp).toBe(2);
    expect(st.printed_sold).toBe(0);
    expect(Number(st.printed_revenue_paisa)).toBe(0);
  });

  it("'require sale' batches refuse unsold tickets at the gate", async () => {
    const { eventId, batchId } = await setup(3);
    await org(() => rpc(c, "set_print_batch_options", [batchId, true, 150000], ["uuid", "bool", "int8"]));
    expect((await scan(eventId, 1)).result).toBe("not_sold");
    const t = await c.query("select status, sale_status from public.tickets where event_id = $1 and serial_no = 1", [eventId]);
    expect(t.rows[0]).toEqual({ status: "valid", sale_status: "in_stock" });
    await sell(SEED.organizer, eventId, 1, 1);
    expect((await scan(eventId, 1)).result).toBe("ok");
  });

  it("team sellers can only sell their own tickets, by QR or range", async () => {
    const { eventId } = await setup(10);
    const member = await createUser(c, "Seller Sara");
    await c.query("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'scanner')", [SEED.org, member.id]);
    const sara = await seller(eventId, "", member.id);
    const name = await c.query("select name from public.print_sellers where id = $1", [sara]);
    expect(name.rows[0].name).toBe("Seller Sara");
    await assign(eventId, sara, 1, 5);

    expect(await sell(member.id, eventId, 1, 10)).toBe(5); // only 1–5 are hers
    const t6 = await ticketId(eventId, 6);
    const res = await asUser(c, member.id, () =>
      rpc<{ result: string }>(c, "sell_printed_ticket", [t6, "cash", false, null, null], ["uuid", "text", "bool", "text", "text"]),
    );
    expect(res.result).toBe("not_yours");
    await assign(eventId, sara, 6, 6);
    const ok = await asUser(c, member.id, () =>
      rpc<{ result: string; serial: string; price_paisa: number }>(c, "sell_printed_ticket", [t6, "easypaisa", false, "Bilal", "03111111111"], ["uuid", "text", "bool", "text", "text"]),
    );
    expect(ok).toMatchObject({ result: "ok", serial: "QWL-0006", price_paisa: 200000 });
    const again = await asUser(c, member.id, () =>
      rpc<{ result: string }>(c, "sell_printed_ticket", [t6, "cash", false, null, null], ["uuid", "text", "bool", "text", "text"]),
    );
    expect(again.result).toBe("already_sold");

    const stock = await asUser(c, member.id, () => c.query("select serial, sale_status from public.my_print_stock($1)", [eventId]));
    expect(stock.rowCount).toBe(6);
    const events = await asUser(c, member.id, () => c.query("select event_id, access from public.my_sell_events()"));
    expect(events.rows.some((e) => e.event_id === eventId && e.access === "seller")).toBe(true);

    // outsiders: nothing
    await expectTL(sell(SEED.student, eventId, 7, 7), "FORBIDDEN");
    await expectTL(asUser(c, member.id, () => rpc(c, "assign_printed_tickets", [eventId, sara, 7, 10], ["uuid", "uuid", "int", "int"])), "FORBIDDEN");
  });

  it("only moves unsold tickets and keeps sellers with tickets", async () => {
    const { eventId } = await setup(10);
    const a = await seller(eventId, "A");
    const b = await seller(eventId, "B");
    await assign(eventId, a, 1, 10);
    await sell(SEED.organizer, eventId, 1, 4);
    expect(await assign(eventId, b, 1, 10)).toBe(6);
    await expectTL(org(() => rpc(c, "delete_print_seller", [a], ["uuid"])), "INVALID_STATE");
    expect(await org(() => rpc<number>(c, "undo_printed_sale", [eventId, 1, 4], ["uuid", "int", "int"]))).toBe(4);
    const empty = await seller(eventId, "Nobody");
    await org(() => rpc(c, "delete_print_seller", [empty], ["uuid"]));
    // an online booking is unaffected by sale columns
    const u = await createUser(c);
    const ev2 = await createEvent(c, [{ price: 0, quantity: 5 }]);
    await book(c, u.id, ev2.eventId, items([ev2.typeIds[0], 1]));
    const t = await c.query("select sale_status, seller_id from public.tickets t join public.orders o on o.id = t.order_id where o.user_id = $1", [u.id]);
    expect(t.rows[0]).toEqual({ sale_status: null, seller_id: null });
  });

  it("hides sellers' money from other people", async () => {
    const { eventId } = await setup(2);
    const a = await seller(eventId, "A");
    await org(() => rpc(c, "add_print_cash", [eventId, a, 100000, "cash", null], ["uuid", "uuid", "int8", "text", "text"]));
    const seen = await asUser(c, SEED.student, () => c.query("select id from public.print_cash_entries where event_id = $1", [eventId]));
    expect(seen.rowCount).toBe(0);
    const sellers = await asUser(c, SEED.student, () => c.query("select id from public.print_sellers where event_id = $1", [eventId]));
    expect(sellers.rowCount).toBe(0);
  });
});
