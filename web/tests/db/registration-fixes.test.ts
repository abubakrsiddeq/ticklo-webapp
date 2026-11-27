import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { SEED, asService, asUser, connect, createEvent, createUser, expectTL, items, rpc, submitProof, type OrderResult } from "./helpers";

// D-064: registration fixes across single events, festivals and competitions

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

const org = <T>(fn: () => Promise<T>) => asUser(c, SEED.organizer, fn);
let phoneSeq = 7000000;
async function buyer(name = "Buyer") {
  const u = await createUser(c, name);
  phoneSeq += 1;
  await c.query("update public.profiles set phone = $2 where id = $1", [u.id, `+92302${phoneSeq}`]);
  return u;
}
const iso = (ms: number) => new Date(ms).toISOString();
async function session(eventId: string, data: Record<string, unknown>) {
  const r = await c.query("select starts_at from public.events where id = $1", [eventId]);
  const start = new Date(r.rows[0].starts_at).getTime();
  const body = { starts_at: iso(start + 60_000), ends_at: iso(start + 3600_000), ...data };
  return org(() => rpc<string>(c, "save_session", [eventId, null, JSON.stringify(body)], ["uuid", "uuid", "jsonb"]));
}
const O = ["uuid", "jsonb", "text", "text", "text", "text", "jsonb", "uuid", "jsonb"];
const book = (userId: string, eventId: string, its: string, attendees: unknown = null) =>
  asUser(c, userId, () => rpc<OrderResult>(c, "create_order", [eventId, its, null, null, null, null, null, null, attendees === null ? null : JSON.stringify(attendees)], O));
type Member = { name: string; phone?: string; email?: string; roll_no?: string; university?: string };
const register = (userId: string, sessionId: string, team: string, members: Member[]) =>
  asUser(c, userId, () =>
    rpc<{ registration_id: string; status: string; order: OrderResult | null }>(c, "register_team", [sessionId, team, JSON.stringify(members), null, null, null], [
      "uuid", "text", "jsonb", "jsonb", "text", "text",
    ]),
  );
const decide = (regId: string, ok: boolean) => org(() => rpc(c, "decide_team_registration", [regId, ok, ok ? null : "No"], ["uuid", "boolean", "text"]));
const payTeam = (userId: string, regId: string) => asUser(c, userId, () => rpc<OrderResult>(c, "pay_team_registration", [regId, null, null], ["uuid", "text", "text"]));
const approve = async (userId: string, orderId: string) => {
  await submitProof(c, userId, orderId);
  await org(() => rpc(c, "approve_order", [orderId], ["uuid"]));
};
const tickets = async (orderId: string) =>
  (await c.query("select id, holder_name, holder_university, answers from public.tickets where order_id = $1 order by holder_name", [orderId])).rows;
const scanMain = (ticketId: string, eventId: string) =>
  asService(c, () => rpc<{ result: string }>(c, "perform_check_in", [ticketId, eventId, SEED.organizer, "scan", "t"], ["uuid", "uuid", "uuid", "checkin_method", "text"]));

describe("festival tickets sell until their session starts", () => {
  it("a day-2 workshop ticket still sells after the festival began; a single event's does not", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0 }]);
    await c.query("update public.events set format = 'festival', starts_at = now() - interval '1 hour', ends_at = now() + interval '3 days' where id = $1", [eventId]);
    const s = await c.query(
      "insert into public.event_sessions (event_id, name, kind, starts_at, ends_at, pass_access, created_by) values ($1, 'Day 2 workshop', 'workshop', now() + interval '1 day', now() + interval '1 day 2 hours', false, $2) returning id",
      [eventId, SEED.organizer],
    );
    await org(() => rpc(c, "set_ticket_type_access", [typeIds[0], false, [s.rows[0].id]], ["uuid", "bool", "uuid[]"]));
    const u = await buyer();
    expect((await book(u.id, eventId, items([typeIds[0], 1]))).status).toBe("approved");

    const single = await createEvent(c, [{ price: 0 }]);
    await c.query("update public.events set starts_at = now() - interval '1 hour', ends_at = now() + interval '3 hours' where id = $1", [single.eventId]);
    await expectTL(book((await buyer()).id, single.eventId, items([single.typeIds[0], 1])), "SALE_CLOSED");
  });
});

describe("team entries", () => {
  it("a per-team fee still gives every member a ticket that gets through the gate", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const comp = await session(eventId, { name: "Futsal", kind: "competition", capacity: 4, team_min: 3, team_max: 3, fee_paisa: 0 });
    const lead = await buyer("Usman");
    const r = await register(lead.id, comp, "Strikers", [{ name: "Usman" }, { name: "Bilal" }, { name: "Hamza" }]);
    const ts = await tickets(r.order!.order_id);
    expect(ts.map((t) => t.holder_name)).toEqual(["Bilal", "Hamza", "Usman"]);
    for (const t of ts) expect((await scanMain(t.id, eventId)).result).toBe("ok");
  });

  it("individuals enter under their own name, and two people may share a name", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const quiz = await session(eventId, { name: "Quiz", kind: "competition", capacity: 10, team_min: 1, team_max: 1, fee_paisa: 0 });
    const a = await register((await buyer()).id, quiz, "", [{ name: "Ali Khan" }]);
    const b = await register((await buyer()).id, quiz, "anything", [{ name: "Ali Khan" }]);
    const names = await c.query("select team_name from public.team_registrations where id = any($1)", [[a.registration_id, b.registration_id]]);
    expect(names.rows.map((x) => x.team_name)).toEqual(["Ali Khan", "Ali Khan"]);
  });

  it("organizers choose required details; phones and emails are checked; nobody is in two teams", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const comp = await session(eventId, { name: "Hackathon", kind: "competition", capacity: 10, team_min: 2, team_max: 3, fee_paisa: 0 });
    await expectTL(asUser(c, (await buyer()).id, () => rpc(c, "set_session_member_fields", [comp, ["university"]], ["uuid", "text[]"])), "FORBIDDEN");
    await org(() => rpc(c, "set_session_member_fields", [comp, ["university", "phone", "nonsense"]], ["uuid", "text[]"]));
    expect((await c.query("select member_required from public.event_sessions where id = $1", [comp])).rows[0].member_required).toEqual(["phone", "university"]);

    const lead = await buyer();
    const ok = { university: "NUST" };
    await expectTL(register(lead.id, comp, "T1", [{ name: "A One", phone: "+923001110001" }, { name: "B Two", phone: "+923001110002" }]), "INVALID_ITEMS");
    await expectTL(register(lead.id, comp, "T1", [{ name: "A One", phone: "0300", ...ok }, { name: "B Two", phone: "+923001110002", ...ok }]), "INVALID_ITEMS");
    await expectTL(register(lead.id, comp, "T1", [{ name: "A One", phone: "+923001110001", ...ok }, { name: "B Two", phone: "+923001110001", ...ok }]), "INVALID_ITEMS");
    await register(lead.id, comp, "T1", [{ name: "A One", phone: "+923001110001", ...ok }, { name: "B Two", phone: "+923001110002", ...ok }]);
    await expectTL(
      register((await buyer()).id, comp, "T2", [{ name: "C Three", phone: "+923001110003", ...ok }, { name: "B Again", phone: "+923001110002", ...ok }]),
      "MEMBER_TAKEN",
    );
  });

  it("the lead changes members until it starts; after paying the count stays and ticket names follow", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const comp = await session(eventId, { name: "MUN", kind: "competition", capacity: 5, team_min: 2, team_max: 3, fee_paisa: 50000 });
    const lead = await buyer("Lead Person");
    const r = await register(lead.id, comp, "Delegates", [{ name: "Lead Person" }, { name: "Old Member" }]);
    const upd = (userId: string, team: string, members: Member[]) =>
      asUser(c, userId, () => rpc(c, "update_team_members", [r.registration_id, team, JSON.stringify(members)], ["uuid", "text", "jsonb"]));
    await expectTL(upd((await buyer()).id, "X", [{ name: "A B" }, { name: "C D" }]), "NOT_FOUND");
    await approve(lead.id, r.order!.order_id);
    await expectTL(upd(lead.id, "Delegates", [{ name: "Lead Person" }, { name: "New Member" }, { name: "Third" }]), "INVALID_STATE");
    await upd(lead.id, "Delegates", [{ name: "Lead Person" }, { name: "New Member" }]);
    expect((await tickets(r.order!.order_id)).map((t) => t.holder_name)).toEqual(["Lead Person", "New Member"]);
  });
});

describe("shortlisting holds places", () => {
  it("accepting holds a place to pay; no accepting past the places; the hold ends after its time", async () => {
    const { eventId } = await createEvent(c, [{ price: 100000 }]);
    const comp = await session(eventId, { name: "Pitch", kind: "competition", capacity: 1, team_min: 1, team_max: 2, fee_paisa: 30000, needs_approval: true });
    const a = await buyer();
    const b = await buyer();
    const ra = await register(a.id, comp, "Alpha", [{ name: "Aa Aa" }]);
    const rb = await register(b.id, comp, "Beta", [{ name: "Bb Bb" }]);
    await decide(ra.registration_id, true);
    const payBy = (await c.query("select pay_by from public.team_registrations where id = $1", [ra.registration_id])).rows[0].pay_by;
    expect(payBy).not.toBeNull();
    await expectTL(decide(rb.registration_id, true), "SOLD_OUT");
    expect((await payTeam(a.id, ra.registration_id)).status).toBe("awaiting_payment");

    // Alpha never paid and its hold ran out: Beta can be accepted now
    await c.query("update public.orders set status = 'expired' where id = (select order_id from public.team_registrations where id = $1)", [ra.registration_id]);
    await c.query("update public.team_registrations set pay_by = now() - interval '1 minute' where id = $1", [ra.registration_id]);
    await decide(rb.registration_id, true);
  });
});

describe("bookings", () => {
  it("the buyer cancels an unpaid booking, not one with a payment sent", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 100000 }]);
    const u = await buyer();
    const o1 = await book(u.id, eventId, items([typeIds[0], 1]));
    await expectTL(asUser(c, (await buyer()).id, () => rpc(c, "cancel_my_order", [o1.order_id], ["uuid"])), "NOT_FOUND");
    await asUser(c, u.id, () => rpc(c, "cancel_my_order", [o1.order_id], ["uuid"]));
    const o2 = await book(u.id, eventId, items([typeIds[0], 2]));
    expect(o2.existing).toBe(false);
    await submitProof(c, u.id, o2.order_id);
    await expectTL(asUser(c, u.id, () => rpc(c, "cancel_my_order", [o2.order_id], ["uuid"])), "INVALID_STATE");
  });

  it("organizers can ask a name and university for every ticket", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0 }]);
    await c.query("update public.events set attendee_names = 'required', attendee_university = 'optional' where id = $1", [eventId]);
    const u = await buyer("The Buyer");
    const t = typeIds[0];
    await expectTL(book(u.id, eventId, items([t, 2]), [{ ticket_type_id: t, name: "Sara Ahmed" }]), "ATTENDEE_REQUIRED");
    const o = await book(u.id, eventId, items([t, 2]), [
      { ticket_type_id: t, name: "Sara Ahmed", university: "LUMS" },
      { ticket_type_id: t, name: "Omar Ali" },
    ]);
    expect((await tickets(o.order_id)).map((x) => [x.holder_name, x.holder_university])).toEqual([
      ["Omar Ali", null],
      ["Sara Ahmed", "LUMS"],
    ]);

    const off = await createEvent(c, [{ price: 0 }]);
    const o2 = await book(u.id, off.eventId, items([off.typeIds[0], 1]), [{ ticket_type_id: off.typeIds[0], name: "Ignored Name" }]);
    expect((await tickets(o2.order_id))[0].holder_name).toBe("The Buyer");
  });

  it("session questions are answered for every ticket", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0 }]);
    const ws = await session(eventId, { name: "Robotics", kind: "workshop", capacity: 20, pass_access: false, questions: [{ label: "T-shirt size", type: "text", required: true }] });
    await org(() => rpc(c, "set_ticket_type_access", [typeIds[0], false, [ws]], ["uuid", "bool", "uuid[]"]));
    const q = (await c.query("select questions -> 0 ->> 'id' as id from public.event_sessions where id = $1", [ws])).rows[0].id;
    const t = typeIds[0];
    const u = await buyer();
    await expectTL(book(u.id, eventId, items([t, 2]), [{ ticket_type_id: t, answers: { [ws]: { [q]: "M" } } }, { ticket_type_id: t }]), "ANSWERS_REQUIRED");
    const o = await book(u.id, eventId, items([t, 2]), [
      { ticket_type_id: t, answers: { [ws]: { [q]: "M" } } },
      { ticket_type_id: t, answers: { [ws]: { [q]: "XL" } } },
    ]);
    const sizes = (await tickets(o.order_id)).map((x) => x.answers[ws][q]).sort();
    expect(sizes).toEqual(["M", "XL"]);
  });
});

describe("sending for review", () => {
  it("a festival needs a session and a competition event needs a competition", async () => {
    const fest = await createEvent(c, [{ price: 0 }], { status: "draft" });
    await c.query("update public.events set format = 'festival' where id = $1", [fest.eventId]);
    await expectTL(org(() => rpc(c, "submit_event", [fest.eventId], ["uuid"])), "NO_SESSIONS");
    const comp = await createEvent(c, [{ price: 0 }], { status: "draft" });
    await c.query("update public.events set format = 'competition' where id = $1", [comp.eventId]);
    await expectTL(org(() => rpc(c, "submit_event", [comp.eventId], ["uuid"])), "NO_SESSIONS");
  });
});
