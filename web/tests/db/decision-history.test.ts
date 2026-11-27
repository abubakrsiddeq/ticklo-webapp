import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { SEED, asAnon, asService, asUser, book, connect, createEvent, createUser, expectTL, items, rpc, submitProof } from "./helpers";

const ORG_T = ["text", "text", "uuid", "org_type", "text", "text", "jsonb", "text"];
const REVIEW_T = ["uuid", "boolean", "text"];

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

const historyOf = async (targetId: string) =>
  (await c.query("select action, actor_id, details from public.audit_log where target_id = $1 order by id", [targetId])).rows;

describe("decision history (D-076)", () => {
  it("records a society's full path: registered, rejected, resubmitted, approved", async () => {
    const u = await createUser(c, "History Owner");
    const orgId = await asUser(c, u.id, () =>
      rpc<string>(c, "create_organization", ["History Society", `hist-soc-${u.id.slice(0, 6)}`, null, "society", "", null, "{}", null], ORG_T),
    );
    await asUser(c, SEED.admin, () => rpc(c, "review_organization", [orgId, false, "Proof is unreadable"], REVIEW_T));
    await asUser(c, u.id, () => rpc(c, "resubmit_organization", [orgId], ["uuid"]));
    await asUser(c, SEED.admin, () => rpc(c, "review_organization", [orgId, true, null], REVIEW_T));

    const h = await historyOf(orgId);
    expect(h.map((r) => r.action)).toEqual(["org.register", "org.reject", "org.resubmit", "org.approve"]);
    expect(h[0]).toMatchObject({ actor_id: u.id, details: { name: "History Society" } });
    expect(h[1]).toMatchObject({ actor_id: SEED.admin, details: { note: "Proof is unreadable" } });
    expect(h[2]).toMatchObject({ actor_id: u.id, details: { previous_note: "Proof is unreadable" } });
  });

  it("records each time an event is sent for review", async () => {
    const { eventId } = await createEvent(c, [{ price: 50000, quantity: 5 }], { status: "draft" });
    await asUser(c, SEED.member, () => rpc(c, "submit_event", [eventId], ["uuid"]));
    await asUser(c, SEED.admin, () => rpc(c, "review_event", [eventId, false, "Poster missing"], REVIEW_T));
    await asUser(c, SEED.member, () => rpc(c, "submit_event", [eventId], ["uuid"]));
    const h = await historyOf(eventId);
    expect(h.map((r) => r.action)).toEqual(["event.submit", "event.reject", "event.submit"]);
    expect(h[0].details.resubmitted).toBe(false);
    expect(h[2].details.resubmitted).toBe(true);
  });

  it("keeps a deleted university's name in the record", async () => {
    const uniId = (
      await c.query("insert into public.universities (name, city) values ('Deleted Test University', 'Quetta') returning id")
    ).rows[0].id as string;
    await asUser(c, SEED.admin, () => rpc(c, "admin_delete_university", [uniId], ["uuid"]));
    const h = await historyOf(uniId);
    expect(h.at(-1)).toMatchObject({ action: "university.delete", details: { name: "Deleted Test University", city: "Quetta" } });
  });

  it("the record cannot be edited or deleted, even by the service role", async () => {
    const id = (await c.query("select id from public.audit_log order by id desc limit 1")).rows[0].id;
    await expectTL(asService(c, () => c.query("update public.audit_log set details = '{}' where id = $1", [id])), "FORBIDDEN");
    await expectTL(asService(c, () => c.query("delete from public.audit_log where id = $1", [id])), "FORBIDDEN");
    await expect(asService(c, () => c.query("truncate public.audit_log"))).rejects.toThrow();
    expect((await c.query("select count(*)::int n from public.audit_log where id = $1", [id])).rows[0].n).toBe(1);
  });

  it("deleting the account that decided keeps the record (actor becomes empty)", async () => {
    const actor = await createUser(c, "Leaving Admin");
    await c.query("update public.profiles set is_admin = true where id = $1", [actor.id]);
    const { eventId } = await createEvent(c, [{ price: 0, quantity: 5 }], { status: "pending_review" });
    await asUser(c, actor.id, () => rpc(c, "review_event", [eventId, true, null], REVIEW_T));
    await c.query("delete from auth.users where id = $1", [actor.id]);
    const h = await historyOf(eventId);
    expect(h.at(-1)).toMatchObject({ action: "event.approve", actor_id: null });
  });
});

describe("decision history for organizers (D-077)", () => {
  type Row = { action: string; actor_name: string | null; by_ticklo: boolean; subject: string; extra: string | null; reason: string | null; event_name: string | null; total_count: string };
  const history = (userId: string, orgId: string, opts: { actions?: string[] | null; eventId?: string | null; q?: string | null } = {}) =>
    asUser(c, userId, async () =>
      (await c.query<Row>(`select * from public.org_decision_history($1::uuid, $2::text[], $3::uuid, $4::text, 200, 0)`, [orgId, opts.actions ?? null, opts.eventId ?? null, opts.q ?? null])).rows,
    );

  it("shows the society's events and payments, with TickLO admins shown as 'TickLO team'", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 50000, quantity: 10 }], { status: "draft" });
    await asUser(c, SEED.member, () => rpc(c, "submit_event", [eventId], ["uuid"]));
    await asUser(c, SEED.admin, () => rpc(c, "review_event", [eventId, false, "Add a poster"], REVIEW_T));
    await asUser(c, SEED.member, () => rpc(c, "submit_event", [eventId], ["uuid"]));
    await asUser(c, SEED.admin, () => rpc(c, "review_event", [eventId, true, null], REVIEW_T));
    const buyer = await createUser(c, "Paying Student");
    const o = await book(c, buyer.id, eventId, items([typeIds[0], 1]));
    await submitProof(c, buyer.id, o.order_id);
    await asUser(c, SEED.organizer, () => rpc(c, "reject_order", [o.order_id, "Amount does not match"], ["uuid", "text"]));

    const rows = await history(SEED.member, SEED.org, { eventId });
    expect(rows.map((r) => r.action)).toEqual(["order.reject", "event.approve", "event.submit", "event.reject", "event.submit"]);
    expect(rows[0]).toMatchObject({ subject: o.ref_code, extra: "Paying Student", reason: "Amount does not match", by_ticklo: false });
    expect(rows[0].actor_name).not.toBe("TickLO team");
    expect(rows[3]).toMatchObject({ actor_name: "TickLO team", by_ticklo: true, reason: "Add a poster", subject: "Test Event" });
    expect(Number(rows[0].total_count)).toBe(5);

    const rejected = await history(SEED.organizer, SEED.org, { eventId, actions: ["event.reject", "order.reject", "user.suspend"] });
    expect(rejected.map((r) => r.action)).toEqual(["order.reject", "event.reject"]);
    expect((await history(SEED.organizer, SEED.org, { eventId, q: "paying" })).map((r) => r.action)).toEqual(["order.reject"]);
  });

  it("shows the society's own review path, but only to its owners and members", async () => {
    const owner = await createUser(c, "Path Owner");
    const orgId = await asUser(c, owner.id, () =>
      rpc<string>(c, "create_organization", ["Path Society", `path-soc-${owner.id.slice(0, 6)}`, null, "society", "", null, "{}", null], ORG_T),
    );
    await asUser(c, SEED.admin, () => rpc(c, "review_organization", [orgId, false, "Logo missing"], REVIEW_T));
    const rows = await history(owner.id, orgId);
    expect(rows.map((r) => [r.action, r.actor_name, r.reason])).toEqual([
      ["org.reject", "TickLO team", "Logo missing"],
      ["org.register", "Path Owner", null],
    ]);
    await expectTL(history(SEED.organizer, orgId), "FORBIDDEN");
    await expectTL(history(SEED.scanner, SEED.org), "FORBIDDEN");
    await expect(asAnon(c, () => c.query("select * from public.org_decision_history($1::uuid)", [orgId]))).rejects.toThrow(/permission denied/);
  });
});
