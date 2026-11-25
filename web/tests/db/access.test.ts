import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  SEED, asAnon, asUser, book, connect, createEvent, createUser, expectTL, items, rpc, submitProof,
} from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

describe("Row Level Security (NFR-04, NFR-07, NFR-15)", () => {
  it("hides drafts and pending events from the public", async () => {
    const draft = await createEvent(c, [{ quantity: 5 }], { status: "draft" });
    const rows = await asAnon(c, () => c.query("select id, status from public.events"));
    const ids = rows.rows.map((r) => r.id);
    expect(ids).toContain(SEED.gala);
    expect(ids).not.toContain(draft.eventId);
    expect(rows.rows.every((r) => ["published", "cancelled"].includes(r.status))).toBe(true);
  });

  it("hides pending societies from the public", async () => {
    const rows = await asAnon(c, () => c.query("select id from public.organizations"));
    expect(rows.rows.map((r) => r.id)).not.toContain(SEED.pendingOrg);
  });

  it("lets students see only their own orders and tickets", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    const a = await createUser(c);
    const b = await createUser(c);
    const oa = await book(c, a.id, eventId, items([typeIds[0], 1]));
    await book(c, b.id, eventId, items([typeIds[0], 1]));
    const orders = await asUser(c, a.id, () => c.query("select id from public.orders"));
    expect(orders.rows.map((r) => r.id)).toEqual([oa.order_id]);
    const tickets = await asUser(c, a.id, () => c.query("select owner_id from public.tickets"));
    expect(tickets.rows.every((r) => r.owner_id === a.id)).toBe(true);
  });

  it("lets organizers see orders of their events but not other societies'", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 1]));
    const asOrg = await asUser(c, SEED.organizer, () => c.query("select id from public.orders where id = $1", [o.order_id]));
    expect(asOrg.rowCount).toBe(1);
    // member@ owns another (pending) society – but is also a member of LUMS Music, so use a stranger
    const stranger = await createUser(c);
    const asStranger = await asUser(c, stranger.id, () => c.query("select id from public.orders where id = $1", [o.order_id]));
    expect(asStranger.rowCount).toBe(0);
  });

  it("keeps payment proofs private to buyer, organizers and admins", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 1]));
    await submitProof(c, u.id, o.order_id);
    const q = "select id from public.payment_proofs where order_id = $1";
    expect((await asUser(c, u.id, () => c.query(q, [o.order_id]))).rowCount).toBe(1);
    expect((await asUser(c, SEED.organizer, () => c.query(q, [o.order_id]))).rowCount).toBe(1);
    expect((await asUser(c, SEED.admin, () => c.query(q, [o.order_id]))).rowCount).toBe(1);
    expect((await asUser(c, SEED.student, () => c.query(q, [o.order_id]))).rowCount).toBe(0);
    expect((await asUser(c, SEED.scanner, () => c.query(q, [o.order_id]))).rowCount).toBe(0);
  });

  it("does not let users make themselves admin or unsuspend themselves", async () => {
    await expect(
      asUser(c, SEED.student, () => c.query("update public.profiles set is_admin = true where id = $1", [SEED.student])),
    ).rejects.toThrow(/permission denied/);
    const ok = await asUser(c, SEED.student, () =>
      c.query("update public.profiles set full_name = 'Ali R.' where id = $1", [SEED.student]),
    );
    expect(ok.rowCount).toBe(1);
    await c.query("update public.profiles set full_name = 'Ali Raza' where id = $1", [SEED.student]);
  });

  it("does not let students change another user's profile", async () => {
    const r = await asUser(c, SEED.student, () =>
      c.query("update public.profiles set full_name = 'Hacked' where id = $1", [SEED.organizer]),
    );
    expect(r.rowCount).toBe(0);
  });

  it("does not let users publish events directly", async () => {
    const { eventId } = await createEvent(c, [{ quantity: 5 }], { status: "draft" });
    await expect(
      asUser(c, SEED.organizer, () => c.query("update public.events set status = 'published' where id = $1", [eventId])),
    ).rejects.toThrow(/permission denied/);
  });

  it("only lets owners manage payment accounts (ORG-02)", async () => {
    const insert = (uid: string) =>
      asUser(c, uid, () =>
        c.query(
          "insert into public.payment_accounts (org_id, kind, account_title, account_number) values ($1, 'jazzcash', 'Test', '03001112222')",
          [SEED.org],
        ),
      );
    await expect(insert(SEED.member)).rejects.toThrow(/row-level security/);
    const r = await insert(SEED.organizer);
    expect(r.rowCount).toBe(1);
  });

  it("shows the event's payment accounts to a student only after they book", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ quantity: 10 }]);
    const u = await createUser(c);
    const q = "select id from public.payment_accounts where id = $1";
    expect((await asUser(c, u.id, () => c.query(q, [SEED.bankAccount]))).rowCount).toBe(0);
    await book(c, u.id, eventId, items([typeIds[0], 1]));
    expect((await asUser(c, u.id, () => c.query(q, [SEED.bankAccount]))).rowCount).toBe(1);
  });

  it("only shows audit and email logs to admins", async () => {
    expect((await asUser(c, SEED.organizer, () => c.query("select * from public.audit_log"))).rowCount).toBe(0);
    await expect(asAnon(c, () => c.query("select * from public.audit_log"))).rejects.toThrow(/permission denied/);
  });
});

describe("ticket type rules (ORG-07, rule 2, rule 7)", () => {
  it("locks price after the first booking but allows more quantity", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 100000, quantity: 5 }], { capacity: 20 });
    const u = await createUser(c);
    await book(c, u.id, eventId, items([typeIds[0], 2]));
    await expectTL(
      asUser(c, SEED.organizer, () => c.query("update public.ticket_types set price_paisa = 50000 where id = $1", [typeIds[0]])),
      "PRICE_LOCKED",
    );
    await expectTL(
      asUser(c, SEED.organizer, () => c.query("update public.ticket_types set quantity = 1 where id = $1", [typeIds[0]])),
      "QUANTITY_TOO_LOW",
    );
    const ok = await asUser(c, SEED.organizer, () => c.query("update public.ticket_types set quantity = 10 where id = $1", [typeIds[0]]));
    expect(ok.rowCount).toBe(1);
    await expectTL(
      asUser(c, SEED.organizer, () => c.query("delete from public.ticket_types where id = $1", [typeIds[0]])),
      "HAS_BOOKINGS",
    );
  });

  it("keeps total ticket quantity within capacity", async () => {
    const { eventId } = await createEvent(c, [{ quantity: 8 }], { capacity: 10 });
    await expectTL(
      asUser(c, SEED.organizer, () =>
        c.query("insert into public.ticket_types (event_id, name, price_paisa, quantity) values ($1, 'Extra', 0, 3)", [eventId]),
      ),
      "CAPACITY_EXCEEDED",
    );
    await expectTL(
      asUser(c, SEED.organizer, () => c.query("update public.events set capacity = 5 where id = $1", [eventId])),
      "CAPACITY_EXCEEDED",
    );
  });
});

describe("society + event lifecycle (ORG-01, ORG-06, ADM-01, ADM-02, ORG-11)", () => {
  it("creates a pending society with the creator as owner, admin approves", async () => {
    const u = await createUser(c, "New Owner");
    const orgId = await asUser(c, u.id, () =>
      rpc<string>(c, "create_organization", ["Test Society", `test-soc-${u.id.slice(0, 6)}`, null, "society", "About", null, "{}", null],
        ["text", "text", "uuid", "org_type", "text", "text", "jsonb", "text"]),
    );
    const org = await c.query("select status from public.organizations where id = $1", [orgId]);
    expect(org.rows[0].status).toBe("pending");
    await expectTL(asUser(c, u.id, () => rpc(c, "review_organization", [orgId, true, null], ["uuid", "boolean", "text"])), "FORBIDDEN");
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "review_organization", [orgId, false, ""], ["uuid", "boolean", "text"])), "REASON_REQUIRED");
    const res = await asUser(c, SEED.admin, () =>
      rpc<{ approved: boolean; owner_name: string }>(c, "review_organization", [orgId, true, null], ["uuid", "boolean", "text"]),
    );
    expect(res).toMatchObject({ approved: true, owner_name: "New Owner" });
    const audit = await c.query("select action from public.audit_log where target_id = $1", [orgId]);
    expect(audit.rows.map((r) => r.action)).toContain("org.approve");
  });

  it("submits an event for review and lets an admin publish it", async () => {
    const { eventId } = await createEvent(c, [{ price: 50000, quantity: 5 }], { status: "draft" });
    await asUser(c, SEED.member, () => rpc(c, "submit_event", [eventId], ["uuid"]));
    expect((await c.query("select status from public.events where id = $1", [eventId])).rows[0].status).toBe("pending_review");
    await asUser(c, SEED.admin, () => rpc(c, "review_event", [eventId, true, null], ["uuid", "boolean", "text"]));
    expect((await c.query("select status from public.events where id = $1", [eventId])).rows[0].status).toBe("published");
  });

  it("will not submit paid events without a payment account", async () => {
    const { eventId } = await createEvent(c, [{ price: 50000, quantity: 5 }], { status: "draft" });
    await c.query("delete from public.event_payment_accounts where event_id = $1", [eventId]);
    await expectTL(asUser(c, SEED.organizer, () => rpc(c, "submit_event", [eventId], ["uuid"])), "NO_PAYMENT_ACCOUNT");
  });

  it("cancels an event: tickets cancelled, recipients returned, sales closed", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    const u = await createUser(c);
    const o = await book(c, u.id, eventId, items([typeIds[0], 2]));
    const res = await asUser(c, SEED.organizer, () =>
      rpc<{ recipients: { email: string }[] }>(c, "cancel_event", [eventId, "Venue unavailable"], ["uuid", "text"]),
    );
    expect(res.recipients.map((r) => r.email)).toEqual([u.email]);
    const t = await c.query("select distinct status::text from public.tickets where order_id = $1", [o.order_id]);
    expect(t.rows).toEqual([{ status: "cancelled" }]);
    const other = await createUser(c);
    await expectTL(book(c, other.id, eventId, items([typeIds[0], 1])), "EVENT_CANCELLED");
  });
});

describe("team invites (ORG-03)", () => {
  it("invites by email and accepts only with the matching account", async () => {
    const invitee = await createUser(c, "Invitee");
    const inv = await asUser(c, SEED.organizer, () =>
      rpc<{ token: string }>(c, "invite_to_org", [SEED.org, invitee.email.toUpperCase(), "scanner"], ["uuid", "text", "org_role"]),
    );
    await expectTL(asUser(c, SEED.member, () => rpc(c, "invite_to_org", [SEED.org, "x@y.com", "member"], ["uuid", "text", "org_role"])), "FORBIDDEN");
    await expectTL(asUser(c, SEED.student, () => rpc(c, "accept_org_invite", [inv.token], ["text"])), "INVITE_EMAIL_MISMATCH");
    const acc = await asUser(c, invitee.id, () => rpc<{ role: string }>(c, "accept_org_invite", [inv.token], ["text"]));
    expect(acc.role).toBe("scanner");
    await expectTL(
      asUser(c, SEED.organizer, () => rpc(c, "invite_to_org", [SEED.org, invitee.email, "member"], ["uuid", "text", "org_role"])),
      "ALREADY_MEMBER",
    );
  });
});
