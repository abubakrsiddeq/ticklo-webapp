import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { SEED, asAnon, asService, asUser, connect, createEvent, createUser, expectTL, items, rpc, submitProof, type OrderResult } from "./helpers";

// Festivals: sessions, session tickets, scanning, competitions (FES-01 .. FES-14, D-044)

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

const org = <T>(fn: () => Promise<T>) => asUser(c, SEED.organizer, fn);

let phoneSeq = 5000000;
async function buyer(name = "Buyer") {
  const u = await createUser(c, name);
  phoneSeq += 1;
  await c.query("update public.profiles set phone = $2 where id = $1", [u.id, `+92301${phoneSeq}`]);
  return u;
}

async function eventTimes(eventId: string) {
  const r = await c.query("select starts_at, ends_at from public.events where id = $1", [eventId]);
  return { start: new Date(r.rows[0].starts_at).getTime(), end: new Date(r.rows[0].ends_at).getTime() };
}
const iso = (ms: number) => new Date(ms).toISOString();

async function session(eventId: string, data: Record<string, unknown>, id: string | null = null) {
  const t = await eventTimes(eventId);
  const body = { starts_at: iso(t.start + 60_000), ends_at: iso(t.start + 3600_000), ...data };
  return org(() => rpc<string>(c, "save_session", [eventId, id, JSON.stringify(body)], ["uuid", "uuid", "jsonb"]));
}

const access = (typeId: string, all: boolean, sessions: string[] = []) =>
  org(() => rpc(c, "set_ticket_type_access", [typeId, all, sessions], ["uuid", "bool", "uuid[]"]));

const bookFull = (userId: string, eventId: string, its: string, answers: unknown = null) =>
  asUser(c, userId, () =>
    rpc<OrderResult>(c, "create_order", [eventId, its, null, null, null, null, answers === null ? null : JSON.stringify(answers), null], [
      "uuid", "jsonb", "text", "text", "text", "text", "jsonb", "uuid",
    ]),
  );

const approve = async (userId: string, orderId: string) => {
  await submitProof(c, userId, orderId);
  await org(() => rpc(c, "approve_order", [orderId], ["uuid"]));
};

const ticketsOf = async (orderId: string) =>
  (await c.query("select id, holder_name from public.tickets where order_id = $1 order by holder_name", [orderId])).rows as { id: string; holder_name: string }[];

const scanSession = (ticketId: string, sessionId: string, actor: string = SEED.organizer) =>
  asService(c, () => rpc<{ result: string; checked_in_at?: string; session?: string }>(c, "session_check_in", [ticketId, sessionId, actor, "scan", "t"], ["uuid", "uuid", "uuid", "checkin_method", "text"]));
const scanMain = (ticketId: string, eventId: string, actor: string = SEED.organizer) =>
  asService(c, () => rpc<{ result: string }>(c, "perform_check_in", [ticketId, eventId, actor, "scan", "t"], ["uuid", "uuid", "uuid", "checkin_method", "text"]));

const register = (userId: string, sessionId: string, team: string, members: { name: string }[], answers: unknown = null) =>
  asUser(c, userId, () =>
    rpc<{ registration_id: string; status: string; order: OrderResult | null }>(c, "register_team", [sessionId, team, JSON.stringify(members), answers === null ? null : JSON.stringify(answers), null, null], [
      "uuid", "text", "jsonb", "jsonb", "text", "text",
    ]),
  );

describe("sessions and session tickets (FES-01 .. FES-05)", () => {
  it("only organizers make sessions, inside the event dates", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const t = await eventTimes(eventId);
    await expectTL(session(eventId, { name: "Too early", starts_at: iso(t.start - 3600_000) }), "INVALID_ITEMS");
    await expectTL(session(eventId, { name: "" }), "INVALID_ITEMS");
    const s = await buyer();
    await expectTL(
      asUser(c, s.id, () => rpc(c, "save_session", [eventId, null, JSON.stringify({ name: "X", starts_at: iso(t.start), ends_at: iso(t.start + 1000) })], ["uuid", "uuid", "jsonb"])),
      "FORBIDDEN",
    );
    const id = await session(eventId, { name: "AI Workshop", kind: "workshop", capacity: 40, pass_access: false });
    const row = (await c.query("select name, kind, capacity, pass_access from public.event_sessions where id = $1", [id])).rows[0];
    expect(row).toEqual({ name: "AI Workshop", kind: "workshop", capacity: 40, pass_access: false });
    // anyone can read the schedule of a published event
    const sched = await asAnon(c, () => c.query("select * from public.event_schedule($1)", [eventId]));
    expect(sched.rows[0]).toMatchObject({ name: "AI Workshop", remaining: 40 });
  });

  it("enforces session seats across ticket types and printed tickets", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ name: "Workshop", price: 50000 }, { name: "Workshop + Qawwali", price: 90000 }, { name: "Pass", price: 200000 }], { maxPerOrder: 10 });
    const ws = await session(eventId, { name: "AI Workshop", kind: "workshop", capacity: 3, pass_access: false });
    const qw = await session(eventId, { name: "Qawwali", kind: "concert", capacity: 100, pass_access: true });
    await access(typeIds[0], false, [ws]);
    await access(typeIds[1], false, [ws, qw]);
    // the pass opens Qawwali (included in passes) but not the workshop
    const u1 = await buyer();
    await bookFull(u1.id, eventId, items([typeIds[0], 2]));
    const u2 = await buyer();
    await expectTL(bookFull(u2.id, eventId, items([typeIds[1], 2])), "SOLD_OUT");
    await bookFull(u2.id, eventId, items([typeIds[1], 1]));
    const avail = await asAnon(c, () => c.query("select * from public.event_availability($1)", [eventId]));
    const rem = new Map(avail.rows.map((r) => [r.ticket_type_id, r.remaining]));
    expect(rem.get(typeIds[0])).toBe(0);
    expect(rem.get(typeIds[1])).toBe(0);
    expect(rem.get(typeIds[2])).toBe(99); // pass opens Qawwali: 100 seats − 1 used by the combo ticket
    const sched = await asAnon(c, () => c.query("select name, remaining from public.event_schedule($1)", [eventId]));
    expect(sched.rows.find((r) => r.name === "Qawwali")!.remaining).toBe(99);
    // printed tickets use seats too
    const design = JSON.stringify({ version: 1, width: 1800, height: 650, background: "#fff", layers: [{ id: "qr", type: "qr", x: 1050, y: 70, size: 290 }, { id: "brand", type: "brand", x: 1050, y: 490, width: 290, height: 102 }] });
    await expectTL(org(() => rpc(c, "create_print_batch", [eventId, typeIds[0], 1, "WS", design, null, null], ["uuid", "uuid", "int", "text", "jsonb", "text", "text"])), "SOLD_OUT");
  });

  it("refuses direct competition entries and asks session questions", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ name: "AI Workshop", price: 50000 }]);
    const ws = await session(eventId, {
      name: "AI Workshop",
      kind: "workshop",
      pass_access: false,
      questions: [
        { label: "Laptop?", type: "yes_no", required: true },
        { label: "T-shirt", type: "select", options: ["S", "M", "L"], required: false },
      ],
    });
    await access(typeIds[0], false, [ws]);
    const u = await buyer();
    await expectTL(bookFull(u.id, eventId, items([typeIds[0], 1])), "ANSWERS_REQUIRED");
    await expectTL(bookFull(u.id, eventId, items([typeIds[0], 1]), { [ws]: { q1: "yes", q2: "XXL" } }), "ANSWERS_REQUIRED");
    const o = await bookFull(u.id, eventId, items([typeIds[0], 1]), { [ws]: { q1: "yes", q2: "M", junk: "x" } });
    const ans = (await c.query("select answers from public.orders where id = $1", [o.order_id])).rows[0].answers;
    expect(ans).toEqual({ [ws]: { q1: "yes", q2: "M" } });

    const comp = await session(eventId, { name: "Speed Coding", kind: "competition", capacity: 10, team_min: 2, team_max: 3, fee_paisa: 150000 });
    const regType = (await c.query("select id, price_paisa, quantity, all_sessions from public.ticket_types where registration_session_id = $1", [comp])).rows[0];
    expect(regType).toMatchObject({ price_paisa: 150000, quantity: 10, all_sessions: false });
    const u2 = await buyer();
    await expectTL(bookFull(u2.id, eventId, items([regType.id, 1])), "INVALID_ITEMS");
  });

  it("locks access once tickets are sold (only more access allowed)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 50000 }, { price: 50000 }]);
    const a = await session(eventId, { name: "A", kind: "talk" });
    const b = await session(eventId, { name: "B", kind: "talk" });
    await access(typeIds[1], false, [a]);
    const u = await buyer();
    await bookFull(u.id, eventId, items([typeIds[0], 1], [typeIds[1], 1]));
    await expectTL(access(typeIds[0], false, [a]), "ACCESS_LOCKED");
    await expectTL(access(typeIds[1], false, [b]), "ACCESS_LOCKED");
    await access(typeIds[1], false, [a, b]);
    // B is not the only session of a booked ticket → can be deleted; A is opened by booked tickets together with B
    const only = await createEvent(c, [{ price: 50000 }]);
    const lone = await session(only.eventId, { name: "Lone", kind: "talk" });
    await access(only.typeIds[0], false, [lone]);
    const u2 = await buyer();
    await bookFull(u2.id, only.eventId, items([only.typeIds[0], 1]));
    await expectTL(org(() => rpc(c, "delete_session", [lone], ["uuid"])), "INVALID_STATE");
  });
});

describe("session scanning (FES-06, FES-07, FES-12)", () => {
  it("checks in once per session, refuses other sessions, keeps main entry separate", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ name: "Workshop", price: 0 }, { name: "Pass", price: 0 }]);
    const ws = await session(eventId, { name: "Workshop", kind: "workshop", pass_access: false });
    const qw = await session(eventId, { name: "Qawwali", kind: "concert" });
    await access(typeIds[0], false, [ws]);
    const u = await buyer();
    const o = await bookFull(u.id, eventId, items([typeIds[0], 1], [typeIds[1], 1]));
    const tks = (await c.query("select t.id, tt.name from public.tickets t join public.ticket_types tt on tt.id = t.ticket_type_id where t.order_id = $1", [o.order_id])).rows;
    const wsTicket = tks.find((t) => t.name === "Workshop")!.id;
    const passTicket = tks.find((t) => t.name === "Pass")!.id;

    expect((await scanSession(wsTicket, ws)).result).toBe("ok");
    expect((await scanSession(wsTicket, ws)).result).toBe("already_used");
    expect((await scanSession(wsTicket, qw)).result).toBe("wrong_session");
    expect((await scanSession(passTicket, ws)).result).toBe("wrong_session");
    expect((await scanSession(passTicket, qw)).result).toBe("ok");
    // the workshop ticket now "came", and can still pass the main gate once
    expect((await c.query("select status from public.tickets where id = $1", [wsTicket])).rows[0].status).toBe("checked_in");
    expect((await scanMain(wsTicket, eventId)).result).toBe("ok");
    expect((await scanMain(wsTicket, eventId)).result).toBe("already_used");

    // manual check-in from the session list
    const list = await org(() => c.query("select * from public.scanner_session_attendees($1)", [qw]));
    expect(list.rows.map((r) => r.ticket_id)).toEqual([passTicket]);
    const stats = await org(() => c.query("select * from public.session_stats($1)", [eventId]));
    expect(stats.rows.find((r) => r.name === "Workshop")).toMatchObject({ tickets: 1, checked_in: 1 });
  });

  it("limits scanners to sessions and lets managers scan their session", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0 }]);
    const qw = await session(eventId, { name: "Qawwali", kind: "concert" });
    const other = await session(eventId, { name: "Talk", kind: "talk" });
    const vol = await buyer("Volunteer");
    const mgr = await buyer("Manager");
    for (const u of [vol, mgr]) await c.query("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'scanner')", [SEED.org, u.id]);
    await org(() => rpc(c, "assign_scanner", [eventId, vol.id], ["uuid", "uuid"]));
    await org(() => rpc(c, "set_scanner_sessions", [eventId, vol.id, [qw]], ["uuid", "uuid", "uuid[]"]));
    await org(() => rpc(c, "add_session_manager", [other, mgr.id], ["uuid", "uuid"]));

    const u = await buyer();
    const o = await bookFull(u.id, eventId, items([typeIds[0], 1]));
    const t = (await ticketsOf(o.order_id))[0].id;
    expect((await scanMain(t, eventId, vol.id)).result).toBe("not_allowed");
    expect((await scanSession(t, other, vol.id)).result).toBe("not_allowed");
    expect((await scanSession(t, qw, vol.id)).result).toBe("ok");
    expect((await scanSession(t, other, mgr.id)).result).toBe("ok");

    const ev = await asUser(c, vol.id, () => c.query("select * from public.my_scan_events()"));
    expect(ev.rows.find((r) => r.event_id === eventId)).toMatchObject({ sessions_only: true });
    const ss = await asUser(c, vol.id, () => rpc<{ event_entry: boolean; sessions: { name: string }[] }>(c, "my_scan_sessions", [eventId], ["uuid"]));
    expect(ss.event_entry).toBe(false);
    expect(ss.sessions.map((s) => s.name)).toEqual(["Qawwali"]);
    const managed = await asUser(c, mgr.id, () => c.query("select * from public.my_managed_sessions()"));
    expect(managed.rows.map((r) => r.session_name)).toEqual(["Talk"]);
    // a manager cannot see another session's attendees
    await expectTL(asUser(c, mgr.id, () => c.query("select * from public.session_attendees($1)", [qw])), "FORBIDDEN");
  });
});

describe("competitions (FES-10, FES-11, FES-13)", () => {
  it("registers a free team at once with the team name on the ticket", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const comp = await session(eventId, { name: "Debate", kind: "competition", capacity: 1, team_min: 2, team_max: 2, fee_paisa: 0 });
    const lead = await buyer("Ali Lead");
    await expectTL(register(lead.id, comp, "Solo", [{ name: "Ali Lead" }]), "INVALID_ITEMS");
    const r = await register(lead.id, comp, "Alpha", [{ name: "Ali Lead" }, { name: "Sara Two" }]);
    expect(r.status).toBe("approved");
    expect(r.order?.status).toBe("approved");
    expect((await ticketsOf(r.order!.order_id)).map((t) => t.holder_name)).toEqual(["Team Alpha"]);
    await expectTL(register(lead.id, comp, "Beta", [{ name: "Ali Lead" }, { name: "X Y" }]), "ALREADY_REGISTERED");
    const other = await buyer();
    await expectTL(register(other.id, comp, "Gamma", [{ name: "A B" }, { name: "C D" }]), "SOLD_OUT");
    const mine = await asUser(c, lead.id, () => c.query("select * from public.my_team_registrations()"));
    expect(mine.rows[0]).toMatchObject({ team_name: "Alpha", status: "approved", order_status: "approved" });
  });

  it("charges per member and names each ticket after a member", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const comp = await session(eventId, { name: "Hackathon", kind: "competition", capacity: 5, team_min: 1, team_max: 3, fee_mode: "per_member", fee_paisa: 50000 });
    const lead = await buyer("Hamza");
    const r = await register(lead.id, comp, "Coders", [{ name: "Hamza" }, { name: "Bilal" }, { name: "Zara" }]);
    expect(r.order).toMatchObject({ status: "awaiting_payment", total_paisa: 150000 });
    // an unrelated pass booking is separate from the team payment (D-007)
    await approve(lead.id, r.order!.order_id);
    expect((await ticketsOf(r.order!.order_id)).map((t) => t.holder_name)).toEqual(["Bilal", "Hamza", "Zara"]);
    const regs = await org(() => c.query("select * from public.session_registrations($1)", [comp]));
    expect(regs.rows[0]).toMatchObject({ team_name: "Coders", order_status: "approved", tickets: 3 });
  });

  it("shortlists before payment, then the team pays; decline and withdraw", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const comp = await session(eventId, {
      name: "MUN",
      kind: "competition",
      capacity: 2,
      team_min: 1,
      team_max: 1,
      fee_paisa: 100000,
      needs_approval: true,
      questions: [{ label: "Previous MUNs", type: "number", required: true }],
    });
    const a = await buyer("Applicant A");
    await expectTL(register(a.id, comp, "Delegation A", [{ name: "Applicant A" }]), "ANSWERS_REQUIRED");
    const r = await register(a.id, comp, "Delegation A", [{ name: "Applicant A" }], { q1: "3" });
    expect(r).toMatchObject({ status: "pending", order: null });
    await expectTL(asUser(c, a.id, () => rpc(c, "pay_team_registration", [r.registration_id, null, null], ["uuid", "text", "text"])), "INVALID_STATE");
    const stranger = await buyer();
    await expectTL(asUser(c, stranger.id, () => rpc(c, "decide_team_registration", [r.registration_id, true, null], ["uuid", "bool", "text"])), "FORBIDDEN");
    await org(() => rpc(c, "decide_team_registration", [r.registration_id, true, null], ["uuid", "bool", "text"]));
    const o = await asUser(c, a.id, () => rpc<OrderResult>(c, "pay_team_registration", [r.registration_id, null, null], ["uuid", "text", "text"]));
    expect(o).toMatchObject({ status: "awaiting_payment", total_paisa: 100000 });
    // paying again returns the same order
    const again = await asUser(c, a.id, () => rpc<OrderResult>(c, "pay_team_registration", [r.registration_id, null, null], ["uuid", "text", "text"]));
    expect(again.order_id).toBe(o.order_id);

    const b = await buyer("Applicant B");
    const rb = await register(b.id, comp, "Delegation B", [{ name: "Applicant B" }], { q1: "0" });
    await org(() => rpc(c, "decide_team_registration", [rb.registration_id, false, "Not enough experience"], ["uuid", "bool", "text"]));
    expect((await c.query("select status, reject_reason from public.team_registrations where id = $1", [rb.registration_id])).rows[0]).toEqual({ status: "rejected", reject_reason: "Not enough experience" });

    // A withdraws (unpaid) → the order is released
    await asUser(c, a.id, () => rpc(c, "withdraw_team_registration", [r.registration_id], ["uuid"]));
    expect((await c.query("select status from public.orders where id = $1", [o.order_id])).rows[0].status).toBe("expired");
  });

  it("publishes results on the schedule only when asked", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const comp = await session(eventId, { name: "Quiz", kind: "competition", capacity: 5, fee_paisa: 0 });
    const lead = await buyer();
    const r = await register(lead.id, comp, "Brainiacs", [{ name: "Lead Person" }]);
    await org(() => rpc(c, "save_session_results", [comp, JSON.stringify([{ name: "Brainiacs", registration_id: r.registration_id }, { name: "Team Two", label: "Runner-up" }]), false], ["uuid", "jsonb", "bool"]));
    let sched = await asAnon(c, () => c.query("select results from public.event_schedule($1)", [eventId]));
    expect(sched.rows[0].results).toEqual([]);
    await org(() => rpc(c, "save_session_results", [comp, JSON.stringify([{ name: "Brainiacs", registration_id: r.registration_id }, { name: "Team Two", label: "Runner-up" }]), true], ["uuid", "jsonb", "bool"]));
    sched = await asAnon(c, () => c.query("select results from public.event_schedule($1)", [eventId]));
    expect(sched.rows[0].results).toEqual([
      { place: 1, label: "1st", name: "Brainiacs", registration_id: r.registration_id },
      { place: 2, label: "Runner-up", name: "Team Two" },
    ]);
  });
});

describe("duplicate event (FES-01)", () => {
  it("copies sessions and ticket access", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ name: "Workshop ticket", price: 50000 }]);
    const ws = await session(eventId, { name: "Workshop", kind: "workshop", capacity: 20, pass_access: false });
    await access(typeIds[0], false, [ws]);
    await session(eventId, { name: "Coding Cup", kind: "competition", capacity: 8, fee_paisa: 10000 });
    const copy = await createEvent(c, []);
    // what the app does: copy the ticket types first (same name + sort order), then the sessions
    await c.query(
      `insert into public.ticket_types (event_id, name, price_paisa, quantity, sort_order)
       select $2, name, price_paisa, quantity, sort_order from public.ticket_types where event_id = $1`,
      [eventId, copy.eventId],
    );
    expect(await org(() => rpc<number>(c, "duplicate_event_sessions", [eventId, copy.eventId], ["uuid", "uuid"]))).toBe(2);
    const rows = (await c.query(
      `select tt.name, tt.all_sessions, s.name as reg_for,
              (select array_agg(s2.name) from public.ticket_type_sessions x join public.event_sessions s2 on s2.id = x.session_id where x.ticket_type_id = tt.id) as opens
       from public.ticket_types tt left join public.event_sessions s on s.id = tt.registration_session_id
       where tt.event_id = $1 order by tt.sort_order`,
      [copy.eventId],
    )).rows;
    expect(rows[0]).toMatchObject({ name: "Workshop ticket", all_sessions: false, opens: ["Workshop"] });
    expect(rows[1]).toMatchObject({ all_sessions: false, reg_for: "Coding Cup", opens: ["Coding Cup"] });
  });
});
