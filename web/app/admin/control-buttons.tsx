"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { FormField, fieldAria } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { phoneInput } from "@/lib/phone";
import { useActionTransition } from "@/lib/use-action-transition";
import type { ActionResult } from "@/lib/errors";
import { ReasonDialog } from "./reason-dialog";
import { adminCancelEvent } from "./actions";
import {
  adminRejectOrder,
  cancelTicket,
  deleteEvent,
  deleteOrganization,
  deleteUserAccount,
  markOrderRefunded,
  saveSiteSettings,
  setEventSalesPaused,
  suspendOrganization,
  unpublishEvent,
  updateOrderBuyer,
  updateOrganization,
  updateUserProfile,
} from "./control-actions";

// D-084: the admin's buttons and forms for societies, events, orders, accounts and settings.

// ---------------------------------------------------------------------------
// Societies
// ---------------------------------------------------------------------------
export function SuspendSocietyButton({ orgId, name, upcoming }: { orgId: string; name: string; upcoming: number }) {
  return (
    <ReasonDialog
      triggerLabel="Suspend"
      triggerClassName="text-destructive"
      title={`Suspend ${name}?`}
      description={
        <>
          <p>Ticket sales stop and the society cannot create or change anything. Its public page and events are hidden.</p>
          <p>Tickets already sold still work at the gate. The owner is emailed with your reason.</p>
        </>
      }
      reasonHint="The owner sees this reason in the email and on their dashboard."
      reasonPlaceholder="e.g. Payment accounts do not belong to the society"
      checkboxLabel={
        upcoming > 0
          ? `Also cancel its ${upcoming} upcoming event${upcoming === 1 ? "" : "s"} (ticket holders are emailed)`
          : undefined
      }
      submitLabel="Suspend society"
      destructive
      onSubmit={(v) => suspendOrganization(orgId, { reason: v.reason, cancelEvents: v.checked })}
    />
  );
}

export function DeleteSocietyButton({ orgId, name, hasSales }: { orgId: string; name: string; hasSales: boolean }) {
  return (
    <ReasonDialog
      triggerLabel="Delete"
      triggerVariant="destructive"
      title={`Delete ${name}?`}
      description={
        hasSales ? (
          <>
            <p>This society has sold tickets, so its records are kept: orders, tickets and payments stay for disputes.</p>
            <p>It disappears from TickLO, its upcoming events are cancelled (ticket holders are emailed) and its team loses access. You can bring it back later from the Deleted list.</p>
          </>
        ) : (
          <p>
            This society never sold a ticket, so it is <strong>deleted for good</strong> with its events, team and payment accounts. This cannot be undone.
          </p>
        )
      }
      reasonPlaceholder="e.g. Duplicate of another society"
      confirmWord={name}
      confirmLabel={
        <>
          Type the society&apos;s name <strong>{name}</strong> to confirm
        </>
      }
      submitLabel={hasSales ? "Delete society" : "Delete for good"}
      destructive
      onSubmit={(v) => deleteOrganization(orgId, { reason: v.reason, confirmName: v.confirm })}
      redirectTo={(res) => ((res as ActionResult<{ mode: string }>).ok ? "/admin/societies" : null)}
    />
  );
}

export interface SocietyEditValues {
  name: string;
  slug: string;
  universityId: string;
  type: "society" | "department";
}

export function EditSocietyForm({ orgId, initial, universities }: { orgId: string; initial: SocietyEditValues; universities: { id: string; label: string }[] }) {
  const router = useRouter();
  const id = useId();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useActionTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateOrganization(orgId, v);
          if (res.ok) {
            toast.success(res.message ?? "Saved");
            setErrors({});
            router.refresh();
          } else {
            setErrors(res.fieldErrors ?? {});
            toast.error(res.error);
          }
        });
      }}
    >
      <FormField id={`${id}-name`} label="Name" error={errors.name} required>
        <Input {...fieldAria(`${id}-name`, errors.name)} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={120} />
      </FormField>
      <FormField id={`${id}-slug`} label="Link" hint={`ticklo…/s/${v.slug || "…"} (old links stop working)`} error={errors.slug} required>
        <Input {...fieldAria(`${id}-slug`, errors.slug, true)} value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase() })} maxLength={60} />
      </FormField>
      <FormField id={`${id}-uni`} label="University" error={errors.universityId}>
        <NativeSelect id={`${id}-uni`} value={v.universityId} onChange={(e) => setV({ ...v, universityId: e.target.value })}>
          <option value="">No university</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id={`${id}-type`} label="Type">
        <NativeSelect id={`${id}-type`} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as SocietyEditValues["type"] })}>
          <option value="society">Society</option>
          <option value="department">Department</option>
        </NativeSelect>
      </FormField>
      <div className="sm:col-span-2">
        <SubmitButton pending={pending}>Save society</SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
export function PauseSalesButton({ eventId, name }: { eventId: string; name: string }) {
  return (
    <ReasonDialog
      triggerLabel="Pause sales"
      title={`Pause ticket sales for ${name}?`}
      description={<p>Nobody can book, register or join the waitlist until you turn sales on again. Tickets already sold still work.</p>}
      reasonPlaceholder="e.g. Checking the venue permission"
      submitLabel="Pause sales"
      onSubmit={(v) => setEventSalesPaused(eventId, true, v.reason)}
    />
  );
}

export function UnpublishEventButton({ eventId, name }: { eventId: string; name: string }) {
  return (
    <ReasonDialog
      triggerLabel="Unpublish"
      title={`Unpublish ${name}?`}
      description={<p>The event goes back to draft and leaves the public pages. The organizers see your reason and can send it for review again.</p>}
      reasonHint="The organizers see this reason."
      reasonPlaceholder="e.g. Wrong date on the poster"
      submitLabel="Unpublish"
      onSubmit={(v) => unpublishEvent(eventId, v.reason)}
    />
  );
}

export function CancelEventButton({ eventId, name }: { eventId: string; name: string }) {
  return (
    <ReasonDialog
      triggerLabel="Cancel event"
      triggerClassName="text-destructive"
      title={`Cancel ${name}?`}
      description={<p>All tickets stop working and every ticket holder is emailed with your reason. This cannot be undone.</p>}
      reasonLabel="Reason (sent to attendees)"
      reasonHint="Every ticket holder gets this in an email."
      reasonPlaceholder="e.g. The venue cancelled the booking"
      submitLabel="Cancel event"
      destructive
      onSubmit={(v) => adminCancelEvent(eventId, v.reason)}
    />
  );
}

export function DeleteEventButton({ eventId, name, redirectTo }: { eventId: string; name: string; redirectTo?: string }) {
  return (
    <ReasonDialog
      triggerLabel="Delete"
      triggerVariant="destructive"
      title={`Delete ${name}?`}
      description={<p>Nobody booked this event, so it is deleted for good with its ticket types and sessions. This cannot be undone.</p>}
      reasonPlaceholder="e.g. Test event"
      confirmWord="DELETE"
      submitLabel="Delete for good"
      destructive
      onSubmit={(v) => deleteEvent(eventId, v.reason)}
      redirectTo={redirectTo}
    />
  );
}

// ---------------------------------------------------------------------------
// Orders and tickets
// ---------------------------------------------------------------------------
export function RejectOrderButton({ orderId }: { orderId: string }) {
  return (
    <ReasonDialog
      triggerLabel="Reject payment"
      triggerClassName="text-destructive"
      title="Reject this payment?"
      description={<p>The student is emailed with your reason and can upload a new screenshot.</p>}
      reasonLabel="Reason (sent to the student)"
      reasonHint="The student sees this reason."
      reasonPlaceholder="e.g. The amount does not match"
      submitLabel="Reject payment"
      destructive
      onSubmit={(v) => adminRejectOrder(orderId, v.reason)}
    />
  );
}

export function RefundOrderButton({ orderId, refCode }: { orderId: string; refCode: string }) {
  return (
    <ReasonDialog
      triggerLabel="Mark refunded"
      title={`Mark ${refCode} refunded?`}
      description={
        <p>Use this after the money went back to the buyer. The order stops counting as paid, its places become free and its unused tickets stop working.</p>
      }
      reasonLabel="How was the money returned?"
      reasonHint="e.g. the JazzCash or bank transaction ID. Saved in the audit log."
      reasonPlaceholder="JazzCash TID 0123456789, Rs 1,500"
      submitLabel="Mark refunded"
      onSubmit={(v) => markOrderRefunded(orderId, v.reason)}
    />
  );
}

export function CancelTicketButton({ ticketId, code }: { ticketId: string; code: string }) {
  return (
    <ReasonDialog
      triggerLabel="Cancel"
      size="xs"
      triggerClassName="text-destructive"
      title={`Cancel ticket ${code}?`}
      description={<p>Its QR code stops working at the gate. The rest of the order is not changed.</p>}
      reasonPlaceholder="e.g. Sold twice by mistake"
      submitLabel="Cancel ticket"
      destructive
      onSubmit={(v) => cancelTicket(ticketId, v.reason)}
    />
  );
}

export function EditBuyerButton({ orderId, initial }: { orderId: string; initial: { name: string; email: string; phone: string } }) {
  return (
    <FormDialog
      triggerLabel="Edit buyer"
      title="Buyer details"
      description="Fix a typo in the name, email or phone on this order. Tickets are emailed to this address."
      initial={initial}
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "email", label: "Email", type: "email" },
        { key: "phone", label: "Mobile", type: "tel" },
      ]}
      onSubmit={(v) => updateOrderBuyer(orderId, v)}
    />
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export function EditProfileButton({
  userId,
  initial,
  universities,
}: {
  userId: string;
  initial: { fullName: string; email: string; phone: string; universityId: string };
  universities: { id: string; label: string }[];
}) {
  return (
    <FormDialog
      triggerLabel="Edit profile"
      title="Edit profile"
      description="Changing the email changes the login email right away (no confirmation email)."
      initial={initial}
      fields={[
        { key: "fullName", label: "Full name", required: true },
        { key: "email", label: "Email (login)", type: "email", required: true },
        { key: "phone", label: "Mobile", type: "tel" },
        { key: "universityId", label: "University", options: [{ id: "", label: "No university" }, ...universities] },
      ]}
      onSubmit={(v) => updateUserProfile(userId, v)}
    />
  );
}

export function DeleteUserButton({ userId, name, hasRecords }: { userId: string; name: string; hasRecords: boolean }) {
  return (
    <ReasonDialog
      triggerLabel="Delete account"
      triggerVariant="destructive"
      title={`Delete ${name}'s account?`}
      description={
        hasRecords ? (
          <p>
            They have orders or tickets, so those records stay for the societies (shown as &quot;Deleted user&quot;). Their name, email, phone and login are removed and
            they are taken out of every team.
          </p>
        ) : (
          <p>The account is deleted for good. This cannot be undone.</p>
        )
      }
      reasonPlaceholder="e.g. Asked to delete their account by email"
      confirmWord="DELETE"
      submitLabel="Delete account"
      destructive
      onSubmit={(v) => deleteUserAccount(userId, { reason: v.reason, confirm: v.confirm })}
      redirectTo={(res) => ((res as ActionResult<{ mode: string }>).ok && (res as { data?: { mode: string } }).data?.mode === "permanent" ? "/admin/users" : null)}
    />
  );
}

// ---------------------------------------------------------------------------
// Site settings
// ---------------------------------------------------------------------------
export function SiteSettingsForm({ initial }: { initial: { announcement: string; tone: "info" | "warning"; active: boolean } }) {
  const router = useRouter();
  const id = useId();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useActionTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveSiteSettings(v);
          if (res.ok) {
            toast.success(res.message ?? "Saved");
            setErrors({});
            router.refresh();
          } else {
            setErrors(res.fieldErrors ?? {});
            toast.error(res.error);
          }
        });
      }}
    >
      <FormField id={`${id}-text`} label="Announcement" hint={`${v.announcement.length}/300 · shown at the top of every page`} error={errors.announcement}>
        <Textarea
          {...fieldAria(`${id}-text`, errors.announcement, true)}
          value={v.announcement}
          onChange={(e) => setV({ ...v, announcement: e.target.value })}
          maxLength={300}
          rows={3}
          placeholder="e.g. TickLO will be down for maintenance tonight from 2 to 4 AM."
        />
      </FormField>
      <FormField id={`${id}-tone`} label="Colour">
        <NativeSelect id={`${id}-tone`} value={v.tone} onChange={(e) => setV({ ...v, tone: e.target.value as "info" | "warning" })}>
          <option value="info">Navy (news)</option>
          <option value="warning">Amber (warning)</option>
        </NativeSelect>
      </FormField>
      <Label className="flex items-center gap-3 text-sm font-normal text-navy">
        <Checkbox checked={v.active} onCheckedChange={(c) => setV({ ...v, active: c === true })} />
        Show the banner now
      </Label>
      <div>
        <SubmitButton pending={pending}>Save</SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// A small dialog with text fields
// ---------------------------------------------------------------------------
interface FieldSpec {
  key: string;
  label: string;
  type?: "text" | "email" | "tel";
  required?: boolean;
  options?: { id: string; label: string }[];
}

function FormDialog<T extends Record<string, string>>({
  triggerLabel,
  title,
  description,
  initial,
  fields,
  onSubmit,
}: {
  triggerLabel: string;
  title: string;
  description?: string;
  initial: T;
  fields: FieldSpec[];
  onSubmit: (v: T) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useActionTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(initial);
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await onSubmit(v);
              if (res.ok) {
                toast.success(res.message ?? "Saved");
                setOpen(false);
                router.refresh();
              } else {
                setErrors(res.fieldErrors ?? {});
                toast.error(res.error);
              }
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {fields.map((f) => (
            <FormField key={f.key} id={`${id}-${f.key}`} label={f.label} error={errors[f.key]} required={f.required}>
              {f.options ? (
                <NativeSelect id={`${id}-${f.key}`} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                  {f.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <Input
                  {...fieldAria(`${id}-${f.key}`, errors[f.key])}
                  type={f.type ?? "text"}
                  inputMode={f.type === "tel" ? "tel" : undefined}
                  value={v[f.key] ?? ""}
                  onChange={(e) => setV({ ...v, [f.key]: f.type === "tel" ? phoneInput(e.target.value) : e.target.value })}
                />
              )}
            </FormField>
          ))}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pending={pending}>Save</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
