import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { SEED, asService, asUser, book, connect, createEvent, createUser, items, rpc } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

type CheckinResult = { result: string; holder_name?: string; checked_in_at?: string };

const checkIn = (cl: Client, ticketId: string, eventId: string, actor: string) =>
  asService(cl, () =>
    rpc<CheckinResult>(cl, "perform_check_in", [ticketId, eventId, actor, "scan", "test-device"], [
      "uuid", "uuid", "uuid", "checkin_method", "text",
    ]),
  );

async function freeTicket(eventId: string, typeId: string) {
  const u = await createUser(c, "Gate Tester");
  const o = await book(c, u.id, eventId, items([typeId, 1]));
  const t = await c.query("select id from public.tickets where order_id = $1", [o.order_id]);
  return t.rows[0].id as string;
}

describe("check-in (SCN-03, SCN-06, SCN-10, rule 9)", () => {
  it("lets a valid ticket in once, then says already used", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    const ticket = await freeTicket(eventId, typeIds[0]);
    const first = await checkIn(c, ticket, eventId, SEED.organizer);
    expect(first.result).toBe("ok");
    expect(first.holder_name).toBe("Gate Tester");
    const second = await checkIn(c, ticket, eventId, SEED.organizer);
    expect(second.result).toBe("already_used");
    expect(second.checked_in_at).toBeTruthy();
    const log = await c.query("select result::text from public.checkins where ticket_id = $1 order by id", [ticket]);
    expect(log.rows.map((r) => r.result)).toEqual(["ok", "already_used"]);
  });

  it("gives exactly one green when two phones scan at the same moment", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    const ticket = await freeTicket(eventId, typeIds[0]);
    const clients = await Promise.all(Array.from({ length: 4 }, () => connect()));
    try {
      const res = await Promise.all(clients.map((cl) => checkIn(cl, ticket, eventId, SEED.organizer)));
      expect(res.filter((r) => r.result === "ok")).toHaveLength(1);
      expect(res.filter((r) => r.result === "already_used")).toHaveLength(3);
    } finally {
      await Promise.all(clients.map((cl) => cl.end()));
    }
  });

  it("rejects a ticket of another event", async () => {
    const a = await createEvent(c, [{ price: 0, quantity: 10 }]);
    const b = await createEvent(c, [{ price: 0, quantity: 10 }]);
    const ticket = await freeTicket(a.eventId, a.typeIds[0]);
    const r = await checkIn(c, ticket, b.eventId, SEED.organizer);
    expect(r.result).toBe("wrong_event");
  });

  it("does not let a random user scan", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    const ticket = await freeTicket(eventId, typeIds[0]);
    const r = await checkIn(c, ticket, eventId, SEED.student);
    expect(r.result).toBe("not_allowed");
    const t = await c.query("select status from public.tickets where id = $1", [ticket]);
    expect(t.rows[0].status).toBe("valid");
  });

  it("lets an assigned scanner scan until 6 hours after the event (ORG-10)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    await asUser(c, SEED.organizer, () => rpc(c, "assign_scanner", [eventId, SEED.scanner], ["uuid", "uuid"]));
    const ticket = await freeTicket(eventId, typeIds[0]);
    expect((await checkIn(c, ticket, eventId, SEED.scanner)).result).toBe("ok");

    const ticket2 = await freeTicket(eventId, typeIds[0]);
    await c.query(
      "update public.events set starts_at = now() - interval '10 hours', ends_at = now() - interval '7 hours' where id = $1",
      [eventId],
    );
    const exp = await c.query("select expires_at < now() as expired from public.event_staff where event_id = $1", [eventId]);
    expect(exp.rows[0].expired).toBe(true);
    expect((await checkIn(c, ticket2, eventId, SEED.scanner)).result).toBe("not_allowed");
  });

  it("keeps cancelled tickets red", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    const ticket = await freeTicket(eventId, typeIds[0]);
    await c.query("update public.tickets set status = 'cancelled' where id = $1", [ticket]);
    expect((await checkIn(c, ticket, eventId, SEED.organizer)).result).toBe("cancelled");
  });

  it("supports manual check-in by organizers, logged with the method (ORG-13)", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    const ticket = await freeTicket(eventId, typeIds[0]);
    const r = await asUser(c, SEED.member, () => rpc<CheckinResult>(c, "manual_check_in", [ticket, "laptop"], ["uuid", "text"]));
    expect(r.result).toBe("ok");
    const log = await c.query("select method::text, scanned_by from public.checkins where ticket_id = $1", [ticket]);
    expect(log.rows[0]).toEqual({ method: "manual", scanned_by: SEED.member });
  });

  it("is not callable by normal users directly", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    const ticket = await freeTicket(eventId, typeIds[0]);
    await expect(
      asUser(c, SEED.organizer, () =>
        rpc(c, "perform_check_in", [ticket, eventId, SEED.organizer, "scan", null], ["uuid", "uuid", "uuid", "checkin_method", "text"]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("event_stats (ORG-08, SCN-08)", () => {
  it("returns full stats to organizers and only counts to scanners", async () => {
    const { eventId, typeIds } = await createEvent(c, [{ price: 0, quantity: 10 }]);
    await asUser(c, SEED.organizer, () => rpc(c, "assign_scanner", [eventId, SEED.scanner], ["uuid", "uuid"]));
    const ticket = await freeTicket(eventId, typeIds[0]);
    await checkIn(c, ticket, eventId, SEED.organizer);
    const full = await asUser(c, SEED.organizer, () => rpc<Record<string, unknown>>(c, "event_stats", [eventId], ["uuid"]));
    expect(full).toMatchObject({ checked_in: 1, total_tickets: 1, capacity: 1000 });
    expect(full.by_type).toHaveLength(1);
    const limited = await asUser(c, SEED.scanner, () => rpc<Record<string, unknown>>(c, "event_stats", [eventId], ["uuid"]));
    expect(limited).toEqual({ checked_in: 1, total_tickets: 1 });
  });
});
