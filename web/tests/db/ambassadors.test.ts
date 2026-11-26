import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { SEED, asAnon, asService, asUser, connect, createEvent, createUser, expectTL, items, rpc, submitProof, type OrderResult } from "./helpers";

// Ambassadors, referral links, promo codes and rewards (AMB-01 .. AMB-14, D-043)

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

const org = <T>(fn: () => Promise<T>) => asUser(c, SEED.organizer, fn);

let phoneSeq = 4000000;
async function buyer(name = "Buyer") {
  const u = await createUser(c, name);
  phoneSeq += 1;
  await c.query("update public.profiles set phone = $2 where id = $1", [u.id, `+92300${phoneSeq}`]);
  return u;
}

const addSeller = (eventId: string, name: string, phone: string | null = null, userId: string | null = null) =>
  org(() => rpc<string>(c, "save_print_seller", [eventId, null, name, phone, userId], ["uuid", "uuid", "text", "text", "uuid"]));

const codeOf = async (sellerId: string) =>
  (await c.query("select ref_code from public.print_sellers where id = $1", [sellerId])).rows[0].ref_code as string;

const bookWith = (userId: string, eventId: string, its: string, code: string | null = null, ref: string | null = null) =>
  asUser(c, userId, () =>
    rpc<OrderResult & { discount_paisa: number }>(c, "create_order", [eventId, its, null, null, code, ref], ["uuid", "jsonb", "text", "text", "text", "text"]),
  );

const orderRow = async (id: string) =>
  (await c.query("select seller_id, referral_source, promo_code_id, discount_paisa, total_paisa, status from public.orders where id = $1", [id])).rows[0];

const approve = async (userId: string, orderId: string) => {
  await submitProof(c, userId, orderId);
  await org(() => rpc(c, "approve_order", [orderId], ["uuid"]));
};

const settings = (eventId: string, s: Partial<{ reward_type: string; reward_value: number; discount_type: string; discount_value: number; credit_on: string; leaderboard: boolean; applications_open: boolean; milestones: unknown[] }>) =>
  org(() =>
    rpc(c, "save_referral_settings", [
      eventId,
      s.reward_type ?? "none",
      s.reward_value ?? 0,
      s.discount_type ?? "none",
      s.discount_value ?? 0,
      s.credit_on ?? "approved",
      s.leaderboard ?? true,
      s.applications_open ?? false,
      JSON.stringify(s.milestones ?? []),
    ], ["uuid", "text", "int", "text", "int", "text", "bool", "bool", "jsonb"]),
  );

const promo = (eventId: string, code: string, o: Partial<{ type: string; value: number; maxUses: number | null; minTickets: number; types: string[] | null; active: boolean }> = {}) =>
  org(() =>
    rpc<string>(c, "save_promo_code", [eventId, null, code, o.type ?? "percent", o.value ?? 10, o.maxUses ?? null, o.minTickets ?? 1, o.types ?? null, null, null, o.active ?? true, null], [
      "uuid", "uuid", "text", "text", "int", "int", "int", "uuid[]", "timestamptz", "timestamptz", "bool", "text",
    ]),
  );

type Row = { seller_id: string; credited_tickets: number; pending_tickets: number; reward_paisa: string; paid_paisa: string; rank: number; clicks: number; paper_sold: number; credited_revenue_paisa: string; max_orders_same_phone: number };
const summary = async (eventId: string) => {
  const r = await org(() => c.query("select * from public.ambassador_summary($1)", [eventId]));
  return r.rows as Row[];
};
const rowOf = async (eventId: string, sellerId: string) => (await summary(eventId)).find((r) => r.seller_id === sellerId)!;

describe("ambassador codes and links (AMB-01 .. AMB-04)", () => {
  it("gives every seller a unique code from their name and lets the organizer change it", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const a = await addSeller(eventId, "Ali Khan");
    const b = await addSeller(eventId, "Ali Raza");
    const x = await addSeller(eventId, "Z");
    expect(await codeOf(a)).toBe("ALI");
    expect(await codeOf(b)).toBe("ALI2");
    expect(await codeOf(x)).toMatch(/^[A-Z0-9]{3,16}$/);

    expect(await org(() => rpc<string>(c, "set_seller_code", [a, "ali-10"], ["uuid", "text"]))).toBe("ALI10");
    await promo(eventId, "EARLY");
    await expectTL(org(() => rpc(c, "set_seller_code", [b, "early"], ["uuid", "text"])), "CODE_TAKEN");
    await expectTL(promo(eventId, "ALI10"), "CODE_TAKEN");
    await expectTL(org(() => rpc(c, "set_seller_code", [b, "x"], ["uuid", "text"])), "INVALID_CODE");
    // a student cannot change codes
    const s = await buyer();
    await expectTL(asUser(c, s.id, () => rpc(c, "set_seller_code", [b, "HACK"], ["uuid", "text"])), "FORBIDDEN");
  });

  it("links a booking to the ambassador by link or typed code; a typed code wins", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 100000 }]);
    const ali = await addSeller(eventId, "Ali");
    const sara = await addSeller(eventId, "Sara");

    const u1 = await buyer();
    const o1 = await bookWith(u1.id, eventId, items([typeIds[0], 2]), null, "ali");
    expect(await orderRow(o1.order_id)).toMatchObject({ seller_id: ali, referral_source: "link" });

    const u2 = await buyer();
    const o2 = await bookWith(u2.id, eventId, items([typeIds[0], 1]), "SARA", "ALI");
    expect(await orderRow(o2.order_id)).toMatchObject({ seller_id: sara, referral_source: "code" });

    // an unknown link is ignored, an unknown typed code is an error
    const u3 = await buyer();
    const o3 = await bookWith(u3.id, eventId, items([typeIds[0], 1]), null, "NOBODY");
    expect(await orderRow(o3.order_id)).toMatchObject({ seller_id: null, referral_source: null });
    const u4 = await buyer();
    await expectTL(bookWith(u4.id, eventId, items([typeIds[0], 1]), "NOBODY"), "INVALID_CODE");

    // a closed (settled) ambassador gets no new bookings
    await org(() => rpc(c, "settle_print_seller", [sara, true], ["uuid", "bool"]));
    await expectTL(bookWith(u4.id, eventId, items([typeIds[0], 1]), "SARA"), "INVALID_CODE");
    const o5 = await bookWith(u4.id, eventId, items([typeIds[0], 1]), null, "SARA");
    expect((await orderRow(o5.order_id)).seller_id).toBeNull();
  });

  it("never credits an ambassador for their own booking (AMB-12)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 100000 }]);
    const me = await buyer("Hamza Ali");
    await c.query("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [SEED.org, me.id]);
    const mine = await addSeller(eventId, "Hamza", null, me.id);
    const code = await codeOf(mine);
    await expectTL(bookWith(me.id, eventId, items([typeIds[0], 1]), code), "OWN_CODE");
    const o = await bookWith(me.id, eventId, items([typeIds[0], 1]), null, code);
    expect((await orderRow(o.order_id)).seller_id).toBeNull();

    // outside seller whose phone is the buyer's phone (written differently)
    const friend = await buyer();
    const phone = (await c.query("select phone from public.profiles where id = $1", [friend.id])).rows[0].phone as string;
    const local = "0" + phone.slice(3); // +92300… → 0300…
    const outside = await addSeller(eventId, "Bilal", local);
    await expectTL(bookWith(friend.id, eventId, items([typeIds[0], 1]), await codeOf(outside)), "OWN_CODE");
  });

  it("shows what a code gives to anyone and counts link opens", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const ali = await addSeller(eventId, "Ali Khan");
    await settings(eventId, { discount_type: "fixed", discount_value: 10000 });
    await promo(eventId, "FAST20", { type: "percent", value: 20, minTickets: 2 });
    await promo(eventId, "OFFCODE", { active: false });

    const amb = await asAnon(c, () => rpc<Record<string, unknown>>(c, "referral_preview", [eventId, "ali"], ["uuid", "text"]));
    expect(amb).toMatchObject({ kind: "ambassador", valid: true, name: "Ali", discount_type: "fixed", discount_value: 10000 });
    const p = await asAnon(c, () => rpc<Record<string, unknown>>(c, "referral_preview", [eventId, "fast20"], ["uuid", "text"]));
    expect(p).toMatchObject({ kind: "promo", valid: true, discount_type: "percent", discount_value: 20, min_tickets: 2 });
    const off = await asAnon(c, () => rpc<Record<string, unknown>>(c, "referral_preview", [eventId, "OFFCODE"], ["uuid", "text"]));
    expect(off).toMatchObject({ valid: false });
    const none = await asAnon(c, () => rpc<Record<string, unknown>>(c, "referral_preview", [eventId, "ZZZZ"], ["uuid", "text"]));
    expect(none).toMatchObject({ valid: false, kind: null });

    for (let i = 0; i < 3; i++) await asAnon(c, () => rpc(c, "track_referral_click", [eventId, "ALI"], ["uuid", "text"]));
    await asAnon(c, () => rpc(c, "track_referral_click", [eventId, "NOPE"], ["uuid", "text"]));
    expect((await rowOf(eventId, ali)).clicks).toBe(3);
    // anon cannot read the summary
    await expect(asAnon(c, () => c.query("select * from public.ambassador_summary($1)", [eventId]))).rejects.toThrow();
  });
});

describe("discounts and promo codes (AMB-07)", () => {
  it("applies ambassador and promo discounts; the bigger one wins", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 100000 }, { name: "VIP", price: 300000 }]);
    await addSeller(eventId, "Ali");
    await settings(eventId, { discount_type: "fixed", discount_value: 10000 }); // Rs 100 off each ticket

    const u1 = await buyer();
    const o1 = await bookWith(u1.id, eventId, items([typeIds[0], 2]), null, "ALI");
    expect(await orderRow(o1.order_id)).toMatchObject({ discount_paisa: "20000", total_paisa: "180000" });

    // 10% on VIP only, at least 2 VIP tickets
    const vip = await promo(eventId, "VIP10", { type: "percent", value: 10, types: [typeIds[1]], minTickets: 2 });
    const u2 = await buyer();
    await expectTL(bookWith(u2.id, eventId, items([typeIds[1], 1]), "VIP10"), "INVALID_CODE");
    await expectTL(bookWith(u2.id, eventId, items([typeIds[0], 2]), "VIP10"), "INVALID_CODE");
    const o2 = await bookWith(u2.id, eventId, items([typeIds[0], 1], [typeIds[1], 2]), "VIP10");
    expect(await orderRow(o2.order_id)).toMatchObject({ promo_code_id: vip, discount_paisa: "60000", total_paisa: "640000" });

    // promo (Rs 600 off on 2 VIP) vs ambassador link (Rs 100 × 3 = Rs 300): promo wins, ambassador still credited
    const u3 = await buyer();
    const o3 = await bookWith(u3.id, eventId, items([typeIds[0], 1], [typeIds[1], 2]), "VIP10", "ALI");
    const r3 = await orderRow(o3.order_id);
    expect(r3).toMatchObject({ promo_code_id: vip, discount_paisa: "60000", referral_source: "link" });
    expect(r3.seller_id).not.toBeNull();

    // small promo loses against the ambassador discount → promo not recorded as used
    await promo(eventId, "TINY", { type: "fixed", value: 1000 });
    const u4 = await buyer();
    const o4 = await bookWith(u4.id, eventId, items([typeIds[0], 1]), "TINY", "ALI");
    expect(await orderRow(o4.order_id)).toMatchObject({ promo_code_id: null, discount_paisa: "10000" });
  });

  it("limits uses (holds count, expired holds do not) and turns 100% off into free tickets", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 100000 }]);
    await promo(eventId, "ONCE", { type: "percent", value: 50, maxUses: 1 });
    const u1 = await buyer();
    const o1 = await bookWith(u1.id, eventId, items([typeIds[0], 1]), "ONCE");
    const u2 = await buyer();
    await expectTL(bookWith(u2.id, eventId, items([typeIds[0], 1]), "ONCE"), "INVALID_CODE");
    await c.query("update public.orders set hold_expires_at = now() - interval '1 minute' where id = $1", [o1.order_id]);
    const o2 = await bookWith(u2.id, eventId, items([typeIds[0], 1]), "ONCE");
    expect((await orderRow(o2.order_id)).discount_paisa).toBe("50000");

    await promo(eventId, "FREEPASS", { type: "percent", value: 100 });
    const u3 = await buyer();
    const o3 = await bookWith(u3.id, eventId, items([typeIds[0], 2]), "FREEPASS");
    expect(o3.status).toBe("approved");
    expect(Number(o3.total_paisa)).toBe(0);
    expect((await c.query("select count(*)::int n from public.tickets where order_id = $1", [o3.order_id])).rows[0].n).toBe(2);

    // fixed discount never goes below zero per ticket
    await promo(eventId, "HUGE", { type: "fixed", value: 99999999 });
    const u4 = await buyer();
    const o4 = await bookWith(u4.id, eventId, items([typeIds[0], 1]), "HUGE");
    expect(Number(o4.total_paisa)).toBe(0);

    // turned off / used codes cannot be deleted
    const used = (await c.query("select id from public.promo_codes where event_id = $1 and code = 'ONCE'", [eventId])).rows[0].id;
    await expectTL(org(() => rpc(c, "delete_promo_code", [used], ["uuid"])), "INVALID_STATE");
    await org(() => rpc(c, "set_promo_code_active", [used, false], ["uuid", "bool"]));
    const u5 = await buyer();
    await expectTL(bookWith(u5.id, eventId, items([typeIds[0], 1]), "ONCE"), "INVALID_CODE");
  });
});

describe("credit, rewards and payouts (AMB-05, AMB-06, AMB-08)", () => {
  it("credits only approved orders, adds paper sales, ranks and calculates rewards", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 100000 }]);
    const ali = await addSeller(eventId, "Ali");
    const sara = await addSeller(eventId, "Sara");
    await settings(eventId, { reward_type: "fixed", reward_value: 5000, milestones: [{ tickets: 3, reward: "Free ticket" }] });

    const u1 = await buyer();
    const o1 = await bookWith(u1.id, eventId, items([typeIds[0], 2]), "ALI");
    const u2 = await buyer();
    const o2 = await bookWith(u2.id, eventId, items([typeIds[0], 1]), "ALI");
    const u3 = await buyer();
    const o3 = await bookWith(u3.id, eventId, items([typeIds[0], 1]), "SARA");

    let a = await rowOf(eventId, ali);
    expect(a).toMatchObject({ credited_tickets: 0, pending_tickets: 3 });

    await approve(u1.id, o1.order_id);
    await submitProof(c, u2.id, o2.order_id);
    await org(() => rpc(c, "reject_order", [o2.order_id, "wrong amount"], ["uuid", "text"]));
    await approve(u3.id, o3.order_id);

    a = await rowOf(eventId, ali);
    expect(a).toMatchObject({ credited_tickets: 2, pending_tickets: 0 });
    expect(Number(a.reward_paisa)).toBe(10000); // 2 × Rs 50
    expect(Number(a.credited_revenue_paisa)).toBe(200000);
    expect(a.rank).toBe(1);
    expect((await rowOf(eventId, sara)).rank).toBe(2);

    // percent reward
    await settings(eventId, { reward_type: "percent", reward_value: 5 });
    expect(Number((await rowOf(eventId, ali)).reward_paisa)).toBe(10000); // 5% of Rs 2,000

    // payouts (money or a gift with a note)
    await org(() => rpc(c, "add_referral_payout", [eventId, ali, 10000, "JazzCash"], ["uuid", "uuid", "int8", "text"]));
    await org(() => rpc(c, "add_referral_payout", [eventId, ali, 0, "VIP pass"], ["uuid", "uuid", "int8", "text"]));
    await expectTL(org(() => rpc(c, "add_referral_payout", [eventId, ali, 0, null], ["uuid", "uuid", "int8", "text"])), "INVALID_ITEMS");
    expect(Number((await rowOf(eventId, ali)).paid_paisa)).toBe(10000);

    // a seller with bookings cannot be deleted
    await expectTL(org(() => rpc(c, "delete_print_seller", [ali], ["uuid"])), "INVALID_STATE");
  });

  it("can credit only tickets scanned at the gate", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 100000 }]);
    const ali = await addSeller(eventId, "Ali");
    await settings(eventId, { reward_type: "fixed", reward_value: 5000, credit_on: "checked_in" });
    const u = await buyer();
    const o = await bookWith(u.id, eventId, items([typeIds[0], 3]), "ALI");
    await approve(u.id, o.order_id);
    expect((await rowOf(eventId, ali)).credited_tickets).toBe(0);

    const t = (await c.query("select id from public.tickets where order_id = $1 order by created_at limit 1", [o.order_id])).rows[0].id;
    await asService(c, () => rpc(c, "perform_check_in", [t, eventId, SEED.organizer, "scan", "t"], ["uuid", "uuid", "uuid", "checkin_method", "text"]));
    const a = await rowOf(eventId, ali);
    expect(a.credited_tickets).toBe(1);
    expect(Number(a.reward_paisa)).toBe(5000);
    expect(Number(a.credited_revenue_paisa)).toBe(100000);
  });

  it("flags many orders from one phone number", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 50 }], { maxPerOrder: 1 });
    const ali = await addSeller(eventId, "Ali");
    for (let i = 0; i < 3; i++) {
      const u = await buyer();
      await c.query("update public.profiles set phone = '03219998877' where id = $1", [u.id]);
      await bookWith(u.id, eventId, items([typeIds[0], 1]), "ALI");
    }
    expect((await rowOf(eventId, ali)).max_orders_same_phone).toBe(3);
  });

  it("checks settings and keeps milestones tidy", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    await expectTL(settings(eventId, { reward_type: "percent", reward_value: 150 }), "INVALID_ITEMS");
    await expectTL(settings(eventId, { reward_type: "fixed", reward_value: 0 }), "INVALID_ITEMS");
    await expectTL(settings(eventId, { milestones: [{ tickets: 0, reward: "x" }] }), "INVALID_ITEMS");
    await settings(eventId, { milestones: [{ tickets: 25, reward: " VIP " }, { tickets: 10, reward: "Free ticket" }, { tickets: 10, reward: "dup" }] });
    const m = (await c.query("select milestones from public.referral_settings where event_id = $1", [eventId])).rows[0].milestones;
    expect(m).toEqual([{ tickets: 10, reward: "Free ticket" }, { tickets: 25, reward: "VIP" }]);
    const s = await buyer();
    await expectTL(asUser(c, s.id, () => rpc(c, "save_referral_settings", [eventId, "none", 0, "none", 0, "approved", true, false, "[]"], ["uuid", "text", "int", "text", "int", "text", "bool", "bool", "jsonb"])), "FORBIDDEN");
  });
});

describe("applications and the ambassador's own view (AMB-05, AMB-11, AMB-13)", () => {
  it("lets students apply, organizers approve, and the ambassador see their stats", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 100000 }]);
    const stu = await buyer("Sana Tariq");
    await expectTL(asUser(c, stu.id, () => rpc(c, "apply_ambassador", [eventId, "I know 200 people"], ["uuid", "text"])), "APPLICATIONS_CLOSED");
    await settings(eventId, { applications_open: true, reward_type: "fixed", reward_value: 5000 });
    const appId = await asUser(c, stu.id, () => rpc<string>(c, "apply_ambassador", [eventId, "I know 200 people"], ["uuid", "text"]));
    await expectTL(asUser(c, stu.id, () => rpc(c, "apply_ambassador", [eventId, null], ["uuid", "text"])), "ALREADY_APPLIED");

    const apps = await org(() => c.query("select * from public.ambassador_applications_for($1)", [eventId]));
    expect(apps.rows[0]).toMatchObject({ full_name: "Sana Tariq", status: "pending", past_events: 0, past_tickets: 0 });
    // another student cannot see or decide
    const other = await buyer();
    await expectTL(asUser(c, other.id, () => rpc(c, "decide_ambassador_application", [appId, true], ["uuid", "bool"])), "FORBIDDEN");
    await expect(asUser(c, other.id, () => rpc(c, "my_ambassador_stats", [eventId], ["uuid"]))).rejects.toThrow(/TL:FORBIDDEN/);

    const sellerId = await org(() => rpc<string>(c, "decide_ambassador_application", [appId, true], ["uuid", "bool"]));
    expect(sellerId).toBeTruthy();
    const row = (await c.query("select joined_via, ref_code, user_id from public.print_sellers where id = $1", [sellerId])).rows[0];
    expect(row).toMatchObject({ joined_via: "application", ref_code: "SANA", user_id: stu.id });

    // the event shows up in the Sell area even without paper tickets
    const sellEvents = await asUser(c, stu.id, () => c.query("select * from public.my_sell_events()"));
    expect(sellEvents.rows).toEqual([expect.objectContaining({ event_id: eventId, access: "seller", has_printed: false, ref_code: "SANA" })]);

    const u = await buyer();
    const o = await bookWith(u.id, eventId, items([typeIds[0], 2]), null, "SANA");
    await approve(u.id, o.order_id);
    const stats = await asUser(c, stu.id, () =>
      rpc<{ me: Record<string, unknown>; board: { name: string; me: boolean; tickets: number }[]; settings: Record<string, unknown> }>(c, "my_ambassador_stats", [eventId], ["uuid"]),
    );
    expect(stats.me).toMatchObject({ credited_tickets: 2, reward_paisa: 10000, rank: 1 });
    expect(stats.me).not.toHaveProperty("phone");
    expect(stats.board[0]).toMatchObject({ name: "Sana T.", me: true, tickets: 2 });

    const mine = await asUser(c, stu.id, () => c.query("select * from public.my_ambassador_events()"));
    expect(mine.rows[0]).toMatchObject({ event_id: eventId, credited_tickets: 2, ref_code: "SANA" });

    // the track record shows up when Sana applies to the next event
    const next = await createEvent(c, [{ price: 100000 }]);
    await settings(next.eventId, { applications_open: true });
    await asUser(c, stu.id, () => rpc(c, "apply_ambassador", [next.eventId, null], ["uuid", "text"]));
    const nextApps = await org(() => c.query("select * from public.ambassador_applications_for($1)", [next.eventId]));
    expect(nextApps.rows[0]).toMatchObject({ past_events: 1, past_tickets: 2 });
  });
});

describe("TickLO campus ambassadors (AMB-14)", () => {
  it("lets admins name campus ambassadors and societies add their code", async () => {
    const amb = await buyer("Campus Amb");
    await expectTL(org(() => rpc(c, "admin_save_campus_ambassador", [amb.id, "CAMPUS1", null, true], ["uuid", "text", "uuid", "bool"])), "FORBIDDEN");
    await asUser(c, SEED.admin, () => rpc(c, "admin_save_campus_ambassador", [amb.id, "campus-1", null, true], ["uuid", "text", "uuid", "bool"]));

    const owner = await buyer("Society Owner");
    const orgId = (
      await c.query(
        "insert into public.organizations (slug, name, created_by) values ('amb-test-' || substr(md5(random()::text), 1, 6), 'Amb Test Society', $1) returning id",
        [owner.id],
      )
    ).rows[0].id;
    await c.query("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'owner')", [orgId, owner.id]);

    await expectTL(asUser(c, owner.id, () => rpc(c, "set_org_referral", [orgId, "WRONG"], ["uuid", "text"])), "INVALID_CODE");
    await expectTL(asUser(c, amb.id, () => rpc(c, "set_org_referral", [orgId, "CAMPUS1"], ["uuid", "text"])), "FORBIDDEN");
    expect(await asUser(c, owner.id, () => rpc(c, "set_org_referral", [orgId, "campus1"], ["uuid", "text"]))).toBe(true);
    await expectTL(asUser(c, owner.id, () => rpc(c, "set_org_referral", [orgId, "CAMPUS1"], ["uuid", "text"])), "INVALID_STATE");

    const stats = await asUser(c, SEED.admin, () => c.query("select * from public.campus_ambassador_stats(null)"));
    expect(stats.rows.find((r) => r.user_id === amb.id)).toMatchObject({ code: "CAMPUS1", societies: 1, approved_societies: 0 });
    const own = await asUser(c, amb.id, () => c.query("select * from public.my_campus_societies()"));
    expect(own.rows[0]).toMatchObject({ org_name: "Amb Test Society" });
    await expect(asUser(c, owner.id, () => c.query("select * from public.campus_ambassador_stats(null)"))).rejects.toThrow(/TL:FORBIDDEN/);
  });
});
