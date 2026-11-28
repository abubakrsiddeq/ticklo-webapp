import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EventFormat } from "@/lib/sessions";

export interface SetupStep {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  optional?: boolean;
  href?: string;
}

/** FES-15 (D-045): the steps to get a draft live, depending on the kind of event. */
export async function getSetupSteps(event: { id: string; status: string; format: string }, base: string): Promise<SetupStep[]> {
  const supabase = await createClient();
  const [{ data: types }, { data: sessions }, { count: accounts }] = await Promise.all([
    supabase.from("ticket_types").select("id, price_paisa, all_sessions, registration_session_id").eq("event_id", event.id),
    supabase.from("event_sessions").select("id, kind, pass_access").eq("event_id", event.id),
    supabase.from("event_payment_accounts").select("payment_account_id", { count: "exact", head: true }).eq("event_id", event.id),
  ]);
  const format = event.format as EventFormat;
  const tickets = (types ?? []).filter((t) => !t.registration_session_id);
  const passes = tickets.filter((t) => t.all_sessions).length;
  const sessionTickets = tickets.length - passes;
  const comps = (sessions ?? []).filter((s) => s.kind === "competition").length;
  const others = (sessions ?? []).length - comps;
  const paid = (types ?? []).some((t) => t.price_paisa > 0);
  // D-087: sessions nobody can get into yet (no ticket of their own, not in a pass that exists)
  const sessionTicketIds = tickets.filter((t) => !t.all_sessions).map((t) => t.id);
  const { data: opened } =
    format === "festival" && sessionTicketIds.length ? await supabase.from("ticket_type_sessions").select("session_id").in("ticket_type_id", sessionTicketIds) : { data: [] };
  const openedIds = new Set((opened ?? []).map((o) => o.session_id));
  const noWayIn = (sessions ?? []).filter((s) => s.kind !== "competition" && !openedIds.has(s.id) && !(s.pass_access && passes > 0)).length;
  const submitted = event.status === "pending_review" || event.status === "published";

  const details: SetupStep = { key: "details", label: "Event details", detail: "Name, dates, venue, poster", done: true, href: `${base}/details` };
  const payment: SetupStep = {
    key: "payment",
    label: "Payment accounts",
    detail: !paid ? "Not needed – everything is free so far" : accounts ? `${accounts} account${accounts === 1 ? "" : "s"} shown to buyers` : "Choose where buyers send money",
    done: !paid || Boolean(accounts),
    href: `${base}/edit#accounts`,
  };
  const submit: SetupStep = {
    key: "submit",
    label: "Submit for approval",
    detail: event.status === "pending_review" ? "Waiting for TickLO" : event.status === "rejected" ? "Fix and submit again" : "TickLO checks every event before it goes live",
    done: submitted,
    href: `${base}/edit`,
  };

  if (format === "festival") {
    return [
      details,
      {
        key: "sessions",
        label: "Sessions",
        detail: (sessions ?? []).length ? `${others} sessions${comps ? ` + ${comps} competitions` : ""}` : "Add workshops, competitions, nights, talks",
        done: (sessions ?? []).length > 0,
        href: `${base}/schedule`,
      },
      {
        key: "tickets",
        label: "Passes & tickets",
        detail: noWayIn
          ? `${noWayIn} session${noWayIn === 1 ? "" : "s"} with no way in yet`
          : tickets.length
            ? `${passes} pass${passes === 1 ? "" : "es"}, ${sessionTickets} ticket${sessionTickets === 1 ? "" : "s"} for one event`
            : "Set a price in each session's form, or add a pass",
        done: (tickets.length > 0 && noWayIn === 0) || (comps > 0 && others === 0),
        href: noWayIn ? `${base}/schedule` : `${base}/edit#tickets`,
      },
      payment,
      submit,
    ];
  }
  if (format === "competition") {
    return [
      details,
      {
        key: "competition",
        label: "Competition setup",
        detail: comps ? `${comps} competition${comps === 1 ? "" : "s"} taking registrations` : "Team size, entry fee, max teams, shortlisting",
        done: comps > 0,
        href: comps ? `${base}/schedule` : `${base}/schedule?add=competition`,
      },
      {
        key: "tickets",
        label: "Audience tickets",
        detail: tickets.length ? `${tickets.length} ticket type${tickets.length === 1 ? "" : "s"}` : "Only if spectators need a ticket",
        done: tickets.length > 0,
        optional: true,
        href: `${base}/edit#tickets`,
      },
      payment,
      submit,
    ];
  }
  return [
    details,
    { key: "tickets", label: "Ticket types", detail: tickets.length ? `${tickets.length} ticket type${tickets.length === 1 ? "" : "s"}` : "e.g. General, VIP, Student", done: tickets.length > 0, href: `${base}/edit#tickets` },
    payment,
    submit,
  ];
}
