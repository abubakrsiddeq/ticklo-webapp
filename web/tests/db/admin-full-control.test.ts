import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { SEED, asAnon, asUser, connect, createUser, expectTL, items, rpc } from "./helpers";

// D-084: admins can do everything – act as owner, suspend / delete societies,
// pause sales, cancel tickets, refunds, delete accounts, site banner.

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

/** A fresh approved society with its own owner (never the shared seed society). */
async function createOrg(name = "Control Test Society") {
  const owner = await createUser(c, "Owner Person");
  const id = randomUUID();
  await c.query(
    `insert into public.organizations (id, slug, name, university_id, type, status, created_by)
     values ($1, $2, $3, '10000000-0000-4000-8000-000000000001', 'society', 'approved', $4)`,
    [id, `ctl-${id.slice(0, 8)}`, name, owner.id],
  );
  await c.query("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'owner')", [id, owner.id]);
  return { orgId: id, owner, name };
}

/** A published event (in 7 days) with one free ticket type. */
async function createFreeEvent(orgId: string, createdBy: string) {
  const eventId = randomUUID();
  await c.query(
    `insert into public.events (id, org_id, slug, name, venue, starts_at, ends_at, capacity, status, published_at, created_by)
     values ($1, $2, $3, 'Control Night', 'Main Hall', now() + interval '7 days', now() + interval '7 days 3 hours', 100, 'published', now(), $4)`,
    [eventId, orgId, `ev-${eventId.slice(0, 8)}`, createdBy],
  );
  const t = await c.query(
    "insert into public.ticket_types (event_id, name, price_paisa, quantity) values ($1, 'Free pass', 0, 50) returning id",
    [eventId],
  );
  return { eventId, typeId: t.rows[0].id as string };
}

const bookFree = (userId: string, eventId: string, typeId: string) =>
  asUser(c, userId, () => rpc<{ order_id: string; status: string }>(c, "create_order", [eventId, items([typeId, 1])], ["uuid", "jsonb"]));

const orgRow = async (id: string) => (await c.query("select * from public.organizations where id = $1", [id])).rows[0];
const eventRow = async (id: string) => (await c.query("select * from public.events where id = $1", [id])).rows[0];

describe("Admins act as owner of every society", () => {
  it("gives the signed-in admin owner rights, but nobody else", async () => {
    const { orgId, owner } = await createOrg();
    const stranger = await createUser(c);
    const check = (uid: string) =>
      asUser(c, uid, async () => (await c.query("select public.is_org_owner($1) as o, public.is_org_staff($1) as s", [orgId])).rows[0]);
    expect(await check(SEED.admin)).toEqual({ o: true, s: true });
    expect(await check(owner.id)).toEqual({ o: true, s: true });
    expect(await check(stranger.id)).toEqual({ o: false, s: false });
    // asking about the admin from someone else's session does not raise them
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: stranger.id })]);
    const r = (await c.query("select public.org_role_of($1, $2) as r", [orgId, SEED.admin])).rows[0].r;
    await c.query("rollback");
    expect(r).toBeNull();
  });

  it("lets an admin approve a payment in any society", async () => {
    const { orgId, owner } = await createOrg();
    const { eventId } = await createFreeEvent(orgId, owner.id);
    const buyer = await createUser(c);
    const paid = await c.query(
      "insert into public.ticket_types (event_id, name, price_paisa, quantity) values ($1, 'Paid', 50000, 10) returning id",
      [eventId],
    );
    await c.query("insert into public.payment_accounts (org_id, kind, account_title, account_number) values ($1, 'jazzcash', 'Owner', '03001234567') returning id", [orgId]);
    const order = await asUser(c, buyer.id, () => rpc<{ order_id: string }>(c, "create_order", [eventId, items([paid.rows[0].id, 1])], ["uuid", "jsonb"]));
    await c.query("update public.orders set status = 'under_review' where id = $1", [order.order_id]);
    const res = await asUser(c, SEED.admin, () => rpc<{ already_approved: boolean }>(c, "approve_order", [order.order_id]));
    expect(res.already_approved).toBe(false);
    expect((await c.query("select count(*)::int as n from public.tickets where order_id = $1", [order.order_id])).rows[0].n).toBe(1);
  });
});

describe("Suspending a society", () => {
  it("stops sales and edits, keeps sold tickets, and restores", async () => {
    const { orgId, owner, name } = await createOrg("Suspend Me Society");
    const { eventId, typeId } = await createFreeEvent(orgId, owner.id);
    const buyer = await createUser(c);
    const first = await bookFree(buyer.id, eventId, typeId);
    expect(first.status).toBe("approved");

    await expectTL(asUser(c, owner.id, () => rpc(c, "admin_suspend_organization", [orgId, "Fake society", false])), "FORBIDDEN");
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_suspend_organization", [orgId, "", false])), "REASON_REQUIRED");
    const res = await asUser(c, SEED.admin, () =>
      rpc<{ org_name: string; cancelled: unknown[] }>(c, "admin_suspend_organization", [orgId, "Fake payment accounts", false]),
    );
    expect(res.org_name).toBe(name);
    expect(res.cancelled).toEqual([]);
    const org = await orgRow(orgId);
    expect(org.status).toBe("suspended");
    expect(org.suspended_from).toBe("approved");

    // no new bookings
    const other = await createUser(c);
    await expectTL(bookFree(other.id, eventId, typeId), "ORG_SUSPENDED");
    // organizer cannot edit the society or the event, or add events
    await expectTL(asUser(c, owner.id, () => c.query("update public.organizations set about = 'x' where id = $1", [orgId])), "ORG_SUSPENDED");
    await expectTL(asUser(c, owner.id, () => c.query("update public.events set venue = 'Elsewhere' where id = $1", [eventId])), "ORG_SUSPENDED");
    await expectTL(
      asUser(c, owner.id, () =>
        c.query(
          `insert into public.events (org_id, slug, name, venue, starts_at, ends_at, capacity, created_by)
           values ($1, 'new-one', 'New One', 'Hall', now() + interval '9 days', now() + interval '9 days 2 hours', 10, $2)`,
          [orgId, owner.id],
        ),
      ),
      "ORG_SUSPENDED",
    );
    // the admin still can
    await asUser(c, SEED.admin, () => c.query("update public.events set venue = 'Admin Hall' where id = $1", [eventId]));

    // the public no longer sees the society or its events; the buyer still sees theirs
    const anonSees = await asAnon(c, async () => ({
      org: (await c.query("select 1 from public.organizations where id = $1", [orgId])).rowCount,
      ev: (await c.query("select 1 from public.events where id = $1", [eventId])).rowCount,
    }));
    expect(anonSees).toEqual({ org: 0, ev: 0 });
    const buyerSees = await asUser(c, buyer.id, async () => ({
      org: (await c.query("select 1 from public.organizations where id = $1", [orgId])).rowCount,
      ev: (await c.query("select 1 from public.events where id = $1", [eventId])).rowCount,
    }));
    expect(buyerSees).toEqual({ org: 1, ev: 1 });
    // the organizer still sees the dashboard (read-only)
    expect(await asUser(c, owner.id, async () => (await c.query("select 1 from public.organizations where id = $1", [orgId])).rowCount)).toBe(1);
    // the sold ticket is still valid
    expect((await c.query("select status from public.tickets where order_id = $1", [first.order_id])).rows[0].status).toBe("valid");

    await asUser(c, SEED.admin, () => rpc(c, "admin_restore_organization", [orgId]));
    expect((await orgRow(orgId)).status).toBe("approved");
    expect((await bookFree(other.id, eventId, typeId)).status).toBe("approved");

    const log = await c.query("select action from public.audit_log where target_id = $1 and action in ('org.suspend', 'org.restore') order by created_at", [orgId]);
    expect(log.rows.map((r) => r.action)).toEqual(["org.suspend", "org.restore"]);
  });

  it("can cancel the upcoming events and sends pending ones back to draft", async () => {
    const { orgId, owner } = await createOrg();
    const { eventId } = await createFreeEvent(orgId, owner.id);
    const pending = await createFreeEvent(orgId, owner.id);
    await c.query("update public.events set status = 'pending_review', published_at = null where id = $1", [pending.eventId]);
    const res = await asUser(c, SEED.admin, () =>
      rpc<{ cancelled: { event_id: string }[] }>(c, "admin_suspend_organization", [orgId, "Society closed by university", true]),
    );
    expect(res.cancelled.map((x) => x.event_id)).toEqual([eventId]);
    expect((await eventRow(eventId)).status).toBe("cancelled");
    expect((await eventRow(pending.eventId)).status).toBe("draft");
  });
});

describe("Deleting a society", () => {
  it("removes a society that never sold anything for good", async () => {
    const { orgId, owner, name } = await createOrg("Empty Society");
    const { eventId } = await createFreeEvent(orgId, owner.id);
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_delete_organization", [orgId, "Duplicate", "Wrong name"])), "CONFIRM_MISMATCH");
    const res = await asUser(c, SEED.admin, () => rpc<{ mode: string }>(c, "admin_delete_organization", [orgId, "Duplicate", ` ${name.toUpperCase()} `]));
    expect(res.mode).toBe("permanent");
    expect(await orgRow(orgId)).toBeUndefined();
    expect(await eventRow(eventId)).toBeUndefined();
    const log = await c.query("select details from public.audit_log where target_id = $1 and action = 'org.delete'", [orgId]);
    expect(log.rows[0].details.name).toBe(name);
  });

  it("hides a society with sales, keeps the records, and can restore it", async () => {
    const { orgId, owner, name } = await createOrg("Sold Society");
    const { eventId, typeId } = await createFreeEvent(orgId, owner.id);
    const buyer = await createUser(c);
    const order = await bookFree(buyer.id, eventId, typeId);

    const res = await asUser(c, SEED.admin, () =>
      rpc<{ mode: string; cancelled: { event_id: string; recipients: { email: string }[] }[] }>(c, "admin_delete_organization", [orgId, "Fraud", name]),
    );
    expect(res.mode).toBe("hidden");
    expect(res.cancelled[0].event_id).toBe(eventId);
    expect(res.cancelled[0].recipients.map((r) => r.email)).toEqual([buyer.email]);
    expect((await orgRow(orgId)).deleted_at).not.toBeNull();
    expect((await eventRow(eventId)).status).toBe("cancelled");
    expect((await c.query("select count(*)::int as n from public.orders where id = $1", [order.order_id])).rows[0].n).toBe(1);

    // members lose access, the public cannot see it, the buyer still sees their event
    const ownerView = await asUser(c, owner.id, async () => ({
      staff: (await c.query("select public.is_org_staff($1) as s", [orgId])).rows[0].s,
      org: (await c.query("select 1 from public.organizations where id = $1", [orgId])).rowCount,
    }));
    expect(ownerView).toEqual({ staff: false, org: 0 });
    expect(await asAnon(c, async () => (await c.query("select 1 from public.events where id = $1", [eventId])).rowCount)).toBe(0);
    expect(await asUser(c, buyer.id, async () => (await c.query("select 1 from public.events where id = $1", [eventId])).rowCount)).toBe(1);
    // admins act as owner only after a restore
    expect(await asUser(c, SEED.admin, async () => (await c.query("select public.is_org_owner($1) as o", [orgId])).rows[0].o)).toBe(false);

    await asUser(c, SEED.admin, () => rpc(c, "admin_restore_organization", [orgId]));
    expect((await orgRow(orgId)).deleted_at).toBeNull();
    expect(await asUser(c, owner.id, async () => (await c.query("select public.is_org_staff($1) as s", [orgId])).rows[0].s)).toBe(true);
  });

  it("lets the admin rename the society and change its link", async () => {
    const { orgId } = await createOrg();
    const newSlug = `renamed-${orgId.slice(0, 8)}`;
    await asUser(c, SEED.admin, () =>
      rpc(c, "admin_update_organization", [orgId, "Renamed Society", newSlug, null, "department"], ["uuid", "text", "text", "uuid", "org_type"]),
    );
    const org = await orgRow(orgId);
    expect([org.name, org.slug, org.type, org.university_id]).toEqual(["Renamed Society", newSlug, "department", null]);
    await expectTL(
      asUser(c, SEED.admin, () =>
        rpc(c, "admin_update_organization", [orgId, "Renamed Society", "lums-music-society", null, "society"], ["uuid", "text", "text", "uuid", "org_type"]),
      ),
      "SLUG_TAKEN",
    );
  });

  it("turns a payment account off", async () => {
    const { orgId } = await createOrg();
    const acc = await c.query(
      "insert into public.payment_accounts (org_id, kind, account_title, account_number) values ($1, 'easypaisa', 'Owner', '03001234567') returning id",
      [orgId],
    );
    await asUser(c, SEED.admin, () => rpc(c, "admin_set_payment_account_active", [acc.rows[0].id, false]));
    expect((await c.query("select is_active from public.payment_accounts where id = $1", [acc.rows[0].id])).rows[0].is_active).toBe(false);
  });
});

describe("Event controls", () => {
  it("pauses and resumes ticket sales", async () => {
    const { orgId, owner } = await createOrg();
    const { eventId, typeId } = await createFreeEvent(orgId, owner.id);
    const buyer = await createUser(c);
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_set_event_sales_paused", [eventId, true, ""])), "REASON_REQUIRED");
    await asUser(c, SEED.admin, () => rpc(c, "admin_set_event_sales_paused", [eventId, true, "Checking the venue"]));
    await expectTL(bookFree(buyer.id, eventId, typeId), "SALES_PAUSED");
    // organizers cannot lift it themselves (column not granted)
    await expect(asUser(c, owner.id, () => c.query("update public.events set sales_paused_at = null where id = $1", [eventId]))).rejects.toThrow();
    await asUser(c, SEED.admin, () => rpc(c, "admin_set_event_sales_paused", [eventId, false, null]));
    expect((await bookFree(buyer.id, eventId, typeId)).status).toBe("approved");
  });

  it("unpublishes and deletes only events nobody booked", async () => {
    const { orgId, owner } = await createOrg();
    const booked = await createFreeEvent(orgId, owner.id);
    const empty = await createFreeEvent(orgId, owner.id);
    const buyer = await createUser(c);
    await bookFree(buyer.id, booked.eventId, booked.typeId);

    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_unpublish_event", [booked.eventId, "Wrong poster"])), "HAS_BOOKINGS");
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_delete_event", [booked.eventId, "Spam"])), "HAS_BOOKINGS");

    await asUser(c, SEED.admin, () => rpc(c, "admin_unpublish_event", [empty.eventId, "Wrong poster"]));
    const ev = await eventRow(empty.eventId);
    expect(ev.status).toBe("draft");
    expect(ev.review_note).toContain("Wrong poster");
    await asUser(c, SEED.admin, () => rpc(c, "admin_delete_event", [empty.eventId, "Spam event"]));
    expect(await eventRow(empty.eventId)).toBeUndefined();
  });
});

describe("Orders and tickets", () => {
  it("cancels one ticket, corrects the buyer and marks a refund", async () => {
    const { orgId, owner } = await createOrg();
    const { eventId, typeId } = await createFreeEvent(orgId, owner.id);
    const buyer = await createUser(c);
    const order = await bookFree(buyer.id, eventId, typeId);
    const ticket = (await c.query("select id from public.tickets where order_id = $1", [order.order_id])).rows[0].id;

    await asUser(c, SEED.admin, () => rpc(c, "admin_update_order_buyer", [order.order_id, "Hina Shah", "Hina@Example.com", "+923001234567"]));
    const o = (await c.query("select buyer_name, buyer_email from public.orders where id = $1", [order.order_id])).rows[0];
    expect(o).toEqual({ buyer_name: "Hina Shah", buyer_email: "hina@example.com" });
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_update_order_buyer", [order.order_id, "Hina", "not-an-email", null])), "INVALID_EMAIL");

    await asUser(c, SEED.admin, () => rpc(c, "admin_cancel_ticket", [ticket, "Duplicate ticket"]));
    expect((await c.query("select status from public.tickets where id = $1", [ticket])).rows[0].status).toBe("cancelled");
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_cancel_ticket", [ticket, "Again"])), "INVALID_STATE");

    const order2 = await bookFree(buyer.id, eventId, typeId);
    const res = await asUser(c, SEED.admin, () => rpc<{ tickets_cancelled: number }>(c, "admin_mark_order_refunded", [order2.order_id, "JazzCash TID 123"]));
    expect(res.tickets_cancelled).toBe(1);
    const r = (await c.query("select status, refunded_at, refund_note from public.orders where id = $1", [order2.order_id])).rows[0];
    expect(r.status).toBe("rejected");
    expect(r.refunded_at).not.toBeNull();
    expect(r.refund_note).toBe("JazzCash TID 123");
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_mark_order_refunded", [order2.order_id, "Twice"])), "INVALID_STATE");
  });
});

describe("User accounts", () => {
  it("edits a profile and signs someone out everywhere", async () => {
    const u = await createUser(c, "Old Name");
    await c.query("insert into auth.sessions (user_id) values ($1), ($1)", [u.id]);
    await asUser(c, SEED.admin, () => rpc(c, "admin_update_profile", [u.id, "New Name", "+923331112233", null], ["uuid", "text", "text", "uuid"]));
    expect((await c.query("select full_name from public.profiles where id = $1", [u.id])).rows[0].full_name).toBe("New Name");
    const n = await asUser(c, SEED.admin, () => rpc<number>(c, "admin_sign_out_user", [u.id]));
    expect(n).toBe(2);
    expect((await c.query("select count(*)::int as n from auth.sessions where user_id = $1", [u.id])).rows[0].n).toBe(0);
  });

  it("deletes an account with no orders completely", async () => {
    const u = await createUser(c);
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_delete_user", [SEED.admin, "Myself"])), "INVALID_STATE");
    const res = await asUser(c, SEED.admin, () => rpc<{ mode: string }>(c, "admin_delete_user", [u.id, "Asked by email"]));
    expect(res.mode).toBe("permanent");
    expect((await c.query("select count(*)::int as n from auth.users where id = $1", [u.id])).rows[0].n).toBe(0);
  });

  it("removes personal details but keeps orders when the user bought tickets", async () => {
    const { orgId, owner } = await createOrg();
    const { eventId, typeId } = await createFreeEvent(orgId, owner.id);
    const u = await createUser(c, "Buyer Person");
    const order = await bookFree(u.id, eventId, typeId);

    // owners must hand the society over first
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_delete_user", [owner.id, "Left"])), "CANNOT_CHANGE_OWNER");

    const res = await asUser(c, SEED.admin, () => rpc<{ mode: string }>(c, "admin_delete_user", [u.id, "Asked by email"]));
    expect(res.mode).toBe("details_removed");
    const p = (await c.query("select full_name, email, phone, is_suspended, deleted_at from public.profiles where id = $1", [u.id])).rows[0];
    expect([p.full_name, p.email, p.phone, p.is_suspended]).toEqual(["Deleted user", null, null, true]);
    expect(p.deleted_at).not.toBeNull();
    const au = (await c.query("select email, banned_until from auth.users where id = $1", [u.id])).rows[0];
    expect(au.email).toBe(`deleted-${u.id}@deleted.invalid`);
    expect(au.banned_until).not.toBeNull();
    const o = (await c.query("select buyer_name, buyer_email, status from public.orders where id = $1", [order.order_id])).rows[0];
    expect(o).toEqual({ buyer_name: "Deleted user", buyer_email: null, status: "approved" });
  });
});

describe("Site settings and permissions", () => {
  it("shows the announcement to everyone; only admins change it", async () => {
    await expectTL(asUser(c, SEED.organizer, () => rpc(c, "admin_save_site_settings", ["Hello", "info", true])), "FORBIDDEN");
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_save_site_settings", ["", "info", true])), "REASON_REQUIRED");
    await asUser(c, SEED.admin, () => rpc(c, "admin_save_site_settings", ["Maintenance tonight 2 to 4", "warning", true]));
    const row = await asAnon(c, async () => (await c.query("select announcement, announcement_tone, announcement_active from public.site_settings")).rows[0]);
    expect(row).toEqual({ announcement: "Maintenance tonight 2 to 4", announcement_tone: "warning", announcement_active: true });
    await asUser(c, SEED.admin, () => rpc(c, "admin_save_site_settings", ["Maintenance tonight 2 to 4", "warning", false]));
  });

  it("refuses every admin function to non-admins", async () => {
    const id = randomUUID();
    const calls: [string, unknown[], string[]?][] = [
      ["admin_restore_organization", [id]],
      ["admin_delete_organization", [id, "x reason", "x"]],
      ["admin_set_event_sales_paused", [id, true, "reason"]],
      ["admin_unpublish_event", [id, "reason"]],
      ["admin_delete_event", [id, "reason"]],
      ["admin_cancel_ticket", [id, "reason"]],
      ["admin_mark_order_refunded", [id, "reason"]],
      ["admin_sign_out_user", [id]],
      ["admin_delete_user", [id, "reason"]],
      ["admin_set_payment_account_active", [id, false]],
    ];
    for (const [fn, args, casts] of calls) {
      await expectTL(asUser(c, SEED.organizer, () => rpc(c, fn, args, casts)), "FORBIDDEN");
    }
  });
});
