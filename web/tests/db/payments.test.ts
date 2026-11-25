import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  SEED, asUser, book, connect, createEvent, createUser, expectTL, fakeHash, items, rpc, submitProof,
} from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

const approve = (cl: Client, orderId: string, by: string = SEED.organizer) =>
  asUser(cl, by, () => rpc<{ already_approved: boolean; tickets_created: number }>(cl, "approve_order", [orderId], ["uuid"]));
const reject = (cl: Client, orderId: string, reason: string, by: string = SEED.organizer) =>
  asUser(cl, by, () => rpc(cl, "reject_order", [orderId, reason], ["uuid", "text"]));

describe("submit_payment_proof (PAY-04, PAY-05)", () => {
  it("moves the order to under_review and keeps the hold", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 4 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 2]));
    const r = await submitProof(c, u.id, o.order_id, { account: SEED.bankAccount });
    expect(r.is_possible_duplicate).toBe(false);
    const s = await c.query("select status, hold_expires_at from public.orders where id = $1", [o.order_id]);
    expect(s.rows[0].status).toBe("under_review");
    const rem = await c.query("select remaining from public.event_availability($1)", [eventId]);
    expect(rem.rows[0].remaining).toBe(2);
  });

  it("cannot be called by a signed-in user directly (server computes the hash)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 4 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 1]));
    await expect(
      asUser(c, u.id, () =>
        rpc(c, "submit_payment_proof", [u.id, o.order_id, "p", fakeHash("x"), "TXN1", "Me", null, null],
          ["uuid", "uuid", "text", "text", "text", "text", "text", "uuid"]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects proof after the hold expired", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 4 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 1]));
    await c.query("update public.orders set hold_expires_at = now() - interval '1 minute' where id = $1", [o.order_id]);
    await expectTL(submitProof(c, u.id, o.order_id), "ORDER_EXPIRED");
  });

  it("requires the student card photo when the ticket type needs it", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 4, requiresCard: true }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 1]));
    await expectTL(submitProof(c, u.id, o.order_id), "CARD_REQUIRED");
    const r = await submitProof(c, u.id, o.order_id, { card: `x/${o.order_id}/card.jpg` });
    expect(r.proof_id).toBeTruthy();
  });

  it("refuses an account that is not shown for the event", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 4 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 1]));
    await expectTL(submitProof(c, u.id, o.order_id, { account: "30000000-0000-4000-8000-000000000002" }), "INVALID_ACCOUNT");
  });
});

describe("duplicate detection (PAY-09, rule 6)", () => {
  it("flags a reused transaction ID (normalised) within the same event", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const a = await createUser(c);
    const b = await createUser(c);
    const oa = await book(c, a.id, eventId, items([typeIds[0], 1]));
    const ob = await book(c, b.id, eventId, items([typeIds[0], 1]));
    const ra = await submitProof(c, a.id, oa.order_id, { txn: "abc-123 456" });
    expect(ra.is_possible_duplicate).toBe(false);
    const rb = await submitProof(c, b.id, ob.order_id, { txn: "ABC123456" });
    expect(rb.is_possible_duplicate).toBe(true);
    expect(rb.duplicate_reasons).toEqual(["transaction_id"]);
  });

  it("flags a reused screenshot (same image hash)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const a = await createUser(c);
    const b = await createUser(c);
    const oa = await book(c, a.id, eventId, items([typeIds[0], 1]));
    const ob = await book(c, b.id, eventId, items([typeIds[0], 1]));
    const hash = fakeHash("same-image");
    await submitProof(c, a.id, oa.order_id, { hash, txn: "T-AAAA1" });
    const rb = await submitProof(c, b.id, ob.order_id, { hash, txn: "T-BBBB2" });
    expect(rb.is_possible_duplicate).toBe(true);
    expect(rb.duplicate_reasons).toEqual(["screenshot"]);
  });

  it("does not flag the same transaction ID in a different event", async () => {
    const e1 = await createEvent(c, [{ quantity: 10 }]);
    const e2 = await createEvent(c, [{ quantity: 10 }]);
    const u = await createUser(c);
    const o1 = await book(c, u.id, e1.eventId, items([e1.typeIds[0], 1]));
    const o2 = await book(c, u.id, e2.eventId, items([e2.typeIds[0], 1]));
    await submitProof(c, u.id, o1.order_id, { txn: "SAME-TXN-1" });
    const r2 = await submitProof(c, u.id, o2.order_id, { txn: "SAME-TXN-1" });
    expect(r2.is_possible_duplicate).toBe(false);
  });
});

describe("approve / reject (PAY-06, PAY-07, PAY-08, NFR-13)", () => {
  it("approves once and creates tickets exactly once, even if clicked twice", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 3]));
    await submitProof(c, u.id, o.order_id);
    const first = await approve(c, o.order_id);
    expect(first).toMatchObject({ already_approved: false, tickets_created: 3 });
    const second = await approve(c, o.order_id);
    expect(second).toMatchObject({ already_approved: true, tickets_created: 0 });
    const t = await c.query("select count(*)::int as n from public.tickets where order_id = $1", [o.order_id]);
    expect(t.rows[0].n).toBe(3);
  });

  it("creates tickets once when two organizers approve at the same moment", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 2]));
    await submitProof(c, u.id, o.order_id);
    const [c1, c2] = await Promise.all([connect(), connect()]);
    try {
      const res = await Promise.all([approve(c1, o.order_id), approve(c2, o.order_id, SEED.member)]);
      expect(res.map((r) => r.tickets_created).sort()).toEqual([0, 2]);
      const t = await c.query("select count(*)::int as n from public.tickets where order_id = $1", [o.order_id]);
      expect(t.rows[0].n).toBe(2);
    } finally {
      await Promise.all([c1.end(), c2.end()]);
    }
  });

  it("only lets the event's organizers approve", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 1]));
    await submitProof(c, u.id, o.order_id);
    await expectTL(approve(c, o.order_id, u.id), "FORBIDDEN");
    await expectTL(approve(c, o.order_id, SEED.scanner), "FORBIDDEN");
  });

  it("requires a reason to reject, then allows a new screenshot (PAY-08)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 2 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 2]));
    await submitProof(c, u.id, o.order_id);
    await expectTL(reject(c, o.order_id, " "), "REASON_REQUIRED");
    await reject(c, o.order_id, "Amount does not match");
    const s = await c.query("select status, reject_reason from public.orders where id = $1", [o.order_id]);
    expect(s.rows[0]).toEqual({ status: "rejected", reject_reason: "Amount does not match" });
    // stock released after rejection
    const rem = await c.query("select remaining from public.event_availability($1)", [eventId]);
    expect(rem.rows[0].remaining).toBe(2);
    await submitProof(c, u.id, o.order_id, { txn: "NEW-TXN-99", hash: fakeHash("new-shot") });
    const s2 = await c.query("select status from public.orders where id = $1", [o.order_id]);
    expect(s2.rows[0].status).toBe("under_review");
  });

  it("does not allow a new screenshot if the tickets sold out meanwhile", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 1 }]);
    const a = await createUser(c);
    const b = await createUser(c);
    const oa = await book(c, a.id, eventId, items([typeIds[0], 1]));
    await submitProof(c, a.id, oa.order_id);
    await reject(c, oa.order_id, "Wrong amount");
    await book(c, b.id, eventId, items([typeIds[0], 1]));
    await expectTL(submitProof(c, a.id, oa.order_id, { txn: "RETRY-1" }), "SOLD_OUT");
  });
});
