import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  SEED, asService, asUser, book, connect, createEvent, createUser, expectTL, items, rpc,
} from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

async function remaining(eventId: string, typeId: string): Promise<number> {
  const r = await c.query("select remaining from public.event_availability($1) where ticket_type_id = $2", [eventId, typeId]);
  return r.rows[0].remaining;
}

describe("create_order – holds (PAY-01, PAY-02, rule 1)", () => {
  it("creates an awaiting_payment order with a 60 minute hold and reduces availability", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 150000, quantity: 10 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 2]));
    expect(o.status).toBe("awaiting_payment");
    expect(o.ref_code).toMatch(/^TL-\d{6}$/);
    expect(Number(o.total_paisa)).toBe(300000);
    const row = await c.query("select hold_expires_at - now() as left from public.orders where id = $1", [o.order_id]);
    const minutes = row.rows[0].left.minutes ?? 0;
    expect(minutes).toBeGreaterThanOrEqual(59);
    expect(await remaining(eventId, typeIds[0])).toBe(8);
  });

  it("returns the existing unpaid order instead of creating a second hold (D-007)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const u = await createUser(c);
    const first = await book(c, u.id, eventId, items([typeIds[0], 1]));
    const second = await book(c, u.id, eventId, items([typeIds[0], 3]));
    expect(second.existing).toBe(true);
    expect(second.order_id).toBe(first.order_id);
    expect(await remaining(eventId, typeIds[0])).toBe(9);
  });

  it("releases expired holds back to stock (PAY-10)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 5 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 3]));
    expect(await remaining(eventId, typeIds[0])).toBe(2);
    await c.query("update public.orders set hold_expires_at = now() - interval '1 second' where id = $1", [o.order_id]);
    // Availability ignores the expired hold even before the cron job runs
    expect(await remaining(eventId, typeIds[0])).toBe(5);
    const n = await asService(c, () => rpc<number>(c, "expire_stale_orders", []));
    expect(n).toBeGreaterThanOrEqual(1);
    const s = await c.query("select status from public.orders where id = $1", [o.order_id]);
    expect(s.rows[0].status).toBe("expired");
  });

  it("enforces the per-order limit (rule 2)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 50 }], { maxPerOrder: 3 });
    const u = await createUser(c);
    await expectTL(book(c, u.id, eventId, items([typeIds[0], 4])), "MAX_PER_ORDER");
  });

  it("refuses to oversell", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 2 }]);
    const a = await createUser(c);
    const b = await createUser(c);
    await book(c, a.id, eventId, items([typeIds[0], 2]));
    await expectTL(book(c, b.id, eventId, items([typeIds[0], 1])), "SOLD_OUT");
  });

  it("never oversells under concurrent bookings", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 3 }]);
    const users = [];
    for (let i = 0; i < 8; i++) users.push(await createUser(c));
    const clients = await Promise.all(users.map(() => connect()));
    try {
      const results = await Promise.allSettled(
        users.map((u, i) => book(clients[i], u.id, eventId, items([typeIds[0], 1]))),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const soldOut = results.filter((r) => r.status === "rejected" && String(r.reason).includes("TL:SOLD_OUT")).length;
      expect(ok).toBe(3);
      expect(soldOut).toBe(5);
      expect(await remaining(eventId, typeIds[0])).toBe(0);
    } finally {
      await Promise.all(clients.map((x) => x.end()));
    }
  });

  it("closes the sale when the event starts if no end date is set (rule 3)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 5 }]);
    await c.query("update public.events set starts_at = now() - interval '1 minute', ends_at = now() + interval '3 hours' where id = $1", [eventId]);
    const u = await createUser(c);
    await expectTL(book(c, u.id, eventId, items([typeIds[0], 1])), "SALE_CLOSED");
  });

  it("requires name and phone before checkout, and accepts them inline (AUTH-06)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 5 }]);
    const u = await createUser(c);
    await c.query("update public.profiles set phone = null where id = $1", [u.id]);
    await expectTL(book(c, u.id, eventId, items([typeIds[0], 1])), "PROFILE_INCOMPLETE");
    const o = await asUser(c, u.id, () =>
      rpc<{ status: string }>(c, "create_order", [eventId, items([typeIds[0], 1]), "Hina Shah", "+923331234567"], ["uuid", "jsonb", "text", "text"]),
    );
    expect(o.status).toBe("awaiting_payment");
    const p = await c.query("select full_name, phone from public.profiles where id = $1", [u.id]);
    expect(p.rows[0]).toEqual({ full_name: "Hina Shah", phone: "+923331234567" });
  });

  it("does not sell tickets for unpublished or cancelled events", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 5 }], { status: "draft" });
    const u = await createUser(c);
    await expectTL(book(c, u.id, eventId, items([typeIds[0], 1])), "EVENT_NOT_ON_SALE");
    await c.query("update public.events set status = 'cancelled' where id = $1", [eventId]);
    await expectTL(book(c, u.id, eventId, items([typeIds[0], 1])), "EVENT_CANCELLED");
  });
});

describe("free tickets (PAY-12)", () => {
  it("issues tickets immediately for free orders", async () => {
    const u = await createUser(c);
    const o = await book(c, u.id, SEED.gala, items([SEED.galaFree, 2]));
    expect(o.status).toBe("approved");
    const t = await c.query("select count(*)::int as n, min(status::text) as s from public.tickets where order_id = $1", [o.order_id]);
    expect(t.rows[0]).toEqual({ n: 2, s: "valid" });
  });

  it("sends free tickets that need a student card through review (D-009)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 5, requiresCard: true }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 1]));
    expect(o.status).toBe("awaiting_payment");
  });
});
