import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { requireOrgEvent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { accountLabel } from "@/lib/payments/accounts";
import { deleteDraftEvent, submitEvent } from "@/app/org/_actions/events";
import { TicketTypesEditor, type NewTicketPreset } from "./ticket-types-editor";
import { AccountsPicker } from "./accounts-picker";
import { asEventFormat } from "@/lib/sessions";
import { getSetupSteps } from "@/lib/queries/setup";
import { SetupChecklist } from "@/components/sessions/setup-checklist";
import { getEditorTicketTypes } from "@/lib/queries/ticket-types";
import { ticketsTabLabel } from "@/lib/ticket-groups";

export const metadata: Metadata = { title: "Tickets" };

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
  const { data: waitCounts } = await supabase.rpc("event_waitlist_counts", { p_event_id: event.id });
  const typeNames = new Map(((await supabase.from("ticket_types").select("id, name").eq("event_id", event.id)).data ?? []).map((t) => [t.id, t.name]));
  const waitingTypes = (waitCounts ?? [])
    .filter((w) => w.ticket_type_id && w.waiting + w.offered > 0)
    .map((w) => ({ name: typeNames.get(w.ticket_type_id as string) ?? "Ticket", count: w.waiting + w.offered }));
  const [{ data: accounts }, { data: links }, { data: sessions }] = await Promise.all([
    supabase.from("payment_accounts").select("*").eq("org_id", org.id).eq("is_active", true).order("created_at"),
    supabase.from("event_payment_accounts").select("payment_account_id").eq("event_id", event.id),
    supabase.from("event_sessions").select("id, name, kind, pass_access").eq("event_id", event.id).order("starts_at"),
  ]);
  const editorTypes = await getEditorTicketTypes(supabase, event.id, new Map((sessions ?? []).map((s) => [s.id, s.name])));
  // D-087: links from the Schedule tab open the new-ticket form as a pass or a ticket for one session
  const initialNew: NewTicketPreset | null =
    sp.new === "pass"
      ? { kind: "pass" }
      : sp.new === "session" && (sessions ?? []).some((s) => s.id === sp.session && s.kind !== "competition")
        ? { kind: "session", sessionId: sp.session }
        : null;

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
            {sp.duplicated ? (
              <>
                Event copied as a new draft. Check the dates on{" "}
                <Link href={`${base}/details`} className="font-medium underline">
                  Details
                </Link>
                .
              </>
            ) : (
              "Draft created."
            )}{" "}
            Now add ticket types, choose payment accounts and submit for approval.
          </AlertDescription>
        </Alert>
      ) : null}
      {event.status === "rejected" ? (
        <Alert variant="destructive">
          <AlertTitle>Not approved by TickLO</AlertTitle>
          <AlertDescription>
            {event.review_note ?? "No reason given."} Fix it (event details are on{" "}
            <Link href={`${base}/details`} className="font-medium underline">
              Details
            </Link>
            ) and submit again.
          </AlertDescription>
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

      {/* D-071: sold-out tickets with people waiting – a sign to add tickets */}
      {waitingTypes.length ? (
        <p className="rounded-xl bg-warning-soft p-3 text-sm text-navy">
          🔔 Waitlist: {waitingTypes.map((w) => `${w.name} – ${w.count} waiting`).join(" · ")}. Raise the quantity and the next people in line get 2 hours to book.
        </p>
      ) : null}
      <Card id="tickets" className="scroll-mt-28">
        <CardHeader>
          <CardTitle>{format === "competition" ? "Audience tickets (optional)" : format === "festival" ? ticketsTabLabel(format) : "Ticket types"}</CardTitle>
          <CardDescription>
            {format === "competition"
              ? "Teams pay their entry fee when they register (Competition tab). Add tickets here only if spectators need one."
              : format === "festival"
                ? "A festival pass opens every session included in passes; a ticket for one event opens only that session. Price 0 = free."
                : "Price 0 = free ticket, issued instantly."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TicketTypesEditor orgSlug={org.slug} eventId={event.id} types={editorTypes} capacity={event.capacity} editable={editable} sessions={sessions ?? []} format={format} scheduleHref={`${base}/schedule`} initialNew={initialNew} />
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

    </div>
  );
}
