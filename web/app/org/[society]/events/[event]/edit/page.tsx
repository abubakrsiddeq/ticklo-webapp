import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { requireOrgEvent } from "@/lib/auth";
import { ticketFieldsOf } from "@/lib/registration-form";
import { createClient } from "@/lib/supabase/server";
import { toPKTInputValue } from "@/lib/format";
import { accountLabel } from "@/lib/payments/accounts";
import { deleteDraftEvent, duplicateEvent, submitEvent, updateEvent } from "@/app/org/_actions/events";
import { EventForm } from "../../event-form";
import { TicketTypesEditor, type EditorTicketType } from "./ticket-types-editor";
import { AccountsPicker } from "./accounts-picker";
import { asEventFormat } from "@/lib/sessions";
import { getSetupSteps } from "@/lib/queries/setup";
import { SetupChecklist } from "@/components/sessions/setup-checklist";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ society: string; event: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { society, event: eventSlug } = await params;
  const sp = await searchParams;
  const { org, event, isOwner } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/edit`);
  const supabase = await createClient();
  // D-069: the ticket form is locked once tickets were booked (not team entries)
  const { count: bookedOrders } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .in("status", ["approved", "under_review", "awaiting_payment"]);

  const [{ data: types }, { data: availability }, { data: accounts }, { data: links }, { data: sessions }, { data: access }] = await Promise.all([
    supabase.from("ticket_types").select("*").eq("event_id", event.id).order("sort_order").order("created_at"),
    supabase.rpc("event_availability", { p_event_id: event.id }),
    supabase.from("payment_accounts").select("*").eq("org_id", org.id).eq("is_active", true).order("created_at"),
    supabase.from("event_payment_accounts").select("payment_account_id").eq("event_id", event.id),
    supabase.from("event_sessions").select("id, name, kind, pass_access").eq("event_id", event.id).order("starts_at"),
    supabase.from("ticket_type_sessions").select("ticket_type_id, session_id, event_sessions!inner ( event_id )").eq("event_sessions.event_id", event.id),
  ]);
  const sessionName = new Map((sessions ?? []).map((s) => [s.id, s.name]));
  const typeIds = (types ?? []).map((t) => t.id);
  const { data: bookedRows } = typeIds.length
    ? await supabase.from("order_items").select("ticket_type_id, orders!inner ( status )").in("ticket_type_id", typeIds).neq("orders.status", "expired")
    : { data: [] };
  const booked = new Set((bookedRows ?? []).map((r) => r.ticket_type_id));
  const remaining = new Map((availability ?? []).map((a) => [a.ticket_type_id, a.remaining]));

  const editorTypes: EditorTicketType[] = (types ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    price_paisa: t.price_paisa,
    quantity: t.quantity,
    sale_starts_at: t.sale_starts_at,
    sale_ends_at: t.sale_ends_at,
    requires_student_card: t.requires_student_card,
    booked: booked.has(t.id),
    taken: t.quantity - (remaining.get(t.id) ?? t.quantity),
    all_sessions: t.all_sessions,
    session_ids: (access ?? []).filter((a) => a.ticket_type_id === t.id).map((a) => a.session_id),
    registration_for: t.registration_session_id ? (sessionName.get(t.registration_session_id) ?? "a competition") : null,
  }));

  const editable = event.status !== "cancelled";
  const canSubmit = event.status === "draft" || event.status === "rejected";
  const format = asEventFormat(event.format);
  const base = `/org/${org.slug}/events/${event.slug}`;
  const steps = event.status === "published" || event.status === "cancelled" ? null : await getSetupSteps(event, base);

  return (
    <div className="grid gap-6">
      {steps ? <SetupChecklist steps={steps} format={format} /> : null}
      {sp.created || sp.duplicated ? (
        <Alert>
          <AlertDescription>
            {sp.duplicated ? "Event copied as a new draft. Check the dates." : "Draft created."} Now add ticket types, choose payment accounts and
            submit for approval.
          </AlertDescription>
        </Alert>
      ) : null}
      {event.status === "rejected" ? (
        <Alert variant="destructive">
          <AlertTitle>Not approved by TickLO</AlertTitle>
          <AlertDescription>{event.review_note ?? "No reason given."} Fix the details and submit again.</AlertDescription>
        </Alert>
      ) : null}
      {event.status === "pending_review" ? (
        <Alert>
          <AlertTitle>Waiting for TickLO approval</AlertTitle>
          <AlertDescription>You can still make changes while TickLO reviews your event.</AlertDescription>
        </Alert>
      ) : null}

      {canSubmit ? (
        <Card className="border-brand">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-navy">Ready to go live?</p>
              <p className="text-sm text-muted-foreground">TickLO approves every event before it is published (ORG-06).</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="brand" action={submitEvent.bind(null, org.slug, event.id)}>
                Submit for approval
              </ActionButton>
              <ActionButton
                variant="ghost"
                action={deleteDraftEvent.bind(null, org.slug, event.id)}
                confirm={{ title: "Delete this draft?", description: "This cannot be undone.", confirmLabel: "Delete" }}
              >
                Delete draft
              </ActionButton>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card id="tickets" className="scroll-mt-28">
        <CardHeader>
          <CardTitle>{format === "competition" ? "Audience tickets (optional)" : format === "festival" ? "Tickets & passes" : "Ticket types"}</CardTitle>
          <CardDescription>
            {format === "competition"
              ? "Teams pay their entry fee when they register (Competition tab). Add tickets here only if spectators need one."
              : format === "festival"
                ? "A pass opens every session included in passes; a session ticket opens only the sessions you choose. Price 0 = free."
                : "Price 0 = free ticket, issued instantly."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TicketTypesEditor orgSlug={org.slug} eventId={event.id} types={editorTypes} capacity={event.capacity} editable={editable} sessions={sessions ?? []} format={format} scheduleHref={`${base}/schedule`} />
        </CardContent>
      </Card>

      <Card id="accounts" className="scroll-mt-28">
        <CardHeader>
          <CardTitle>Payment accounts shown to students</CardTitle>
          <CardDescription>Students send money directly to these accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountsPicker
            orgSlug={org.slug}
            eventId={event.id}
            isOwner={isOwner}
            accounts={(accounts ?? []).map((a) => ({
              id: a.id,
              label: accountLabel(a),
              detail: `${a.account_title} · ${a.account_number}${a.iban ? ` · ${a.iban}` : ""}`,
            }))}
            selected={(links ?? []).map((l) => l.payment_account_id)}
          />
        </CardContent>
      </Card>

      {editable ? (
        <Card id="details" className="scroll-mt-28">
          <CardHeader>
            <CardTitle>Event details</CardTitle>
          </CardHeader>
          <CardContent>
            <EventForm
              mode="edit"
              action={updateEvent.bind(null, org.slug, event.id)}
              posterUrl={event.poster_url}
              ticketFields={ticketFieldsOf({ member: event.ticket_form }, { names: event.attendee_names, university: event.attendee_university })}
              ticketFormLocked={(bookedOrders ?? 0) > 0}
              defaults={{
                name: event.name,
                description: event.description ?? "",
                venue: event.venue,
                starts_at: toPKTInputValue(event.starts_at),
                ends_at: toPKTInputValue(event.ends_at),
                capacity: event.format === "festival" ? "" : String(event.capacity),
                visibility: event.visibility,
                attendee_names: (event.attendee_names ?? "off") as "off" | "optional" | "required",
                attendee_university: (event.attendee_university ?? "off") as "off" | "optional" | "required",
                max_tickets_per_order: String(event.max_tickets_per_order),
                format: asEventFormat(event.format),
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <div>
        <ActionButton variant="outline" action={duplicateEvent.bind(null, org.slug, event.id)}>
          Duplicate event
        </ActionButton>
      </div>
    </div>
  );
}
