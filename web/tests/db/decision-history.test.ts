import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { SEED, asService, asUser, connect, createEvent, createUser, expectTL, rpc } from "./helpers";

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
