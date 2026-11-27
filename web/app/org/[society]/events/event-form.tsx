"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, fieldAria } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { eventSchema, type EventInput } from "@/lib/validation/event";
import { EVENT_FORMATS } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/errors";

// ORG-04: name, description, poster, venue, start/end (PKT), capacity, visibility, max per order
// (capacity and max per order are not asked for a festival – D-062)
export function EventForm({
  defaults,
  action,
  mode,
  posterUrl,
}: {
  defaults: EventInput;
  action: (fd: FormData) => Promise<ActionResult>;
  mode: "create" | "edit";
  posterUrl?: string | null;
}) {
  const [pending, start] = useTransition();
  const [posterError, setPosterError] = useState<string | undefined>();
  const [preview, setPreview] = useState<string | null>(posterUrl ?? null);
  const form = useForm<EventInput>({ resolver: zodResolver(eventSchema), defaultValues: defaults });
  const { errors } = form.formState;
  const format = useWatch({ control: form.control, name: "format" });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const poster = fd.get("poster");
    if (poster instanceof File && poster.size > 5 * 1024 * 1024) {
      e.preventDefault();
      setPosterError("Poster must be 5 MB or smaller.");
      return;
    }
    void form.handleSubmit(() =>
      start(async () => {
        const res = await action(fd);
        if (!res) return;
        if (res.ok) toast.success(res.message ?? "Saved");
        else {
          toast.error(res.error);
          setPosterError(res.fieldErrors?.poster);
          for (const [k, v] of Object.entries(res.fieldErrors ?? {})) {
            if (k in defaults) form.setError(k as keyof EventInput, { message: v });
          }
        }
      }),
    )(e);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate encType="multipart/form-data">
      {/* FES-15: asked first – the next steps follow from it */}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold text-navy">
          {mode === "create" ? "What kind of event is this?" : "Event type"}
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {EVENT_FORMATS.map((f) => (
            <label
              key={f.key}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-2xl border-2 p-3 text-sm transition-colors",
                format === f.key ? "border-brand bg-brand-soft" : "border-navy/10 hover:border-brand/40",
              )}
            >
              <span className="flex items-center gap-2">
                <input type="radio" value={f.key} className="size-4 accent-[#0B7D47]" {...form.register("format")} />
                <span className="font-semibold text-navy">
                  {f.emoji} {f.label}
                </span>
              </span>
              {mode === "create" ? (
                <>
                  <span className="text-xs text-slate-700">{f.hint}</span>
                  <span className="text-xs text-muted-foreground">{f.example}</span>
                </>
              ) : null}
            </label>
          ))}
        </div>
        {errors.format?.message ? (
          <p role="alert" className="text-sm text-destructive">
            {errors.format.message}
          </p>
        ) : null}
      </fieldset>
      <FormField id="name" label={format === "festival" ? "Festival name" : format === "competition" ? "Competition / event name" : "Event name"} error={errors.name?.message} required>
        <Input
          placeholder={format === "festival" ? "e.g. Aurex 2026" : format === "competition" ? "e.g. CodeFest Hackathon 2026" : "e.g. Winter Gala 2026"}
          {...fieldAria("name", errors.name?.message)}
          {...form.register("name")}
        />
      </FormField>
      <FormField id="description" label="Description" error={errors.description?.message}>
        <Textarea rows={6} {...fieldAria("description", errors.description?.message)} {...form.register("description")} />
      </FormField>
      <FormField id="venue" label="Venue" error={errors.venue?.message} required>
        <Input placeholder="e.g. Main Auditorium, LUMS" {...fieldAria("venue", errors.venue?.message)} {...form.register("venue")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="starts_at" label={format === "festival" ? "Festival starts (first day, PKT)" : "Starts (Pakistan time)"} error={errors.starts_at?.message} required>
          <Input type="datetime-local" {...fieldAria("starts_at", errors.starts_at?.message)} {...form.register("starts_at")} />
        </FormField>
        <FormField
          id="ends_at"
          label={format === "festival" ? "Festival ends (last day, PKT)" : "Ends (Pakistan time)"}
          hint={format !== "single" ? "All sessions must fit between start and end." : undefined}
          error={errors.ends_at?.message}
          required
        >
          <Input type="datetime-local" {...fieldAria("ends_at", errors.ends_at?.message)} {...form.register("ends_at")} />
        </FormField>
      </div>
      {format === "festival" ? (
        // D-062: no festival-wide capacity or per-order limit – each session gets its own seats
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="visibility" label="Visibility" hint="Seats are set per session on the next step." error={errors.visibility?.message} required>
            <NativeSelect {...fieldAria("visibility", errors.visibility?.message)} {...form.register("visibility")}>
              <option value="public">Public – listed on TickLO</option>
              <option value="link_only">Link only – not listed</option>
            </NativeSelect>
          </FormField>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            id="capacity"
            label="Capacity"
            hint={format === "competition" ? "Participants + audience in total." : "Total people allowed in."}
            error={errors.capacity?.message}
            required
          >
            <Input type="number" inputMode="numeric" min={1} {...fieldAria("capacity", errors.capacity?.message, true)} {...form.register("capacity", { shouldUnregister: true })} />
          </FormField>
          <FormField id="max_tickets_per_order" label="Max tickets per order" error={errors.max_tickets_per_order?.message} required>
            <Input type="number" inputMode="numeric" min={1} max={20} {...fieldAria("max_tickets_per_order", errors.max_tickets_per_order?.message)} {...form.register("max_tickets_per_order", { shouldUnregister: true })} />
          </FormField>
          <FormField id="visibility" label="Visibility" error={errors.visibility?.message} required>
            <NativeSelect {...fieldAria("visibility", errors.visibility?.message)} {...form.register("visibility")}>
              <option value="public">Public – listed on TickLO</option>
              <option value="link_only">Link only – not listed</option>
            </NativeSelect>
          </FormField>
        </div>
      )}
      <FormField id="poster" label="Poster" hint="JPG, PNG or WebP, up to 5 MB. Portrait (4:5) looks best." error={posterError}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Poster preview" className="h-32 w-24 rounded-lg object-cover ring-1 ring-border" />
          ) : null}
          <Input
            id="poster"
            name="poster"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="pt-2"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPosterError(undefined);
              if (f) setPreview(URL.createObjectURL(f));
            }}
          />
        </div>
        {mode === "edit" && posterUrl ? (
          <label className="mt-1 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="remove_poster" className="size-5 accent-[#0B7D47]" /> Remove current poster
          </label>
        ) : null}
      </FormField>
      {mode === "create" && format === "competition" ? (
        <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-navy">
          🏆 Next step: you choose whether <strong>individuals or teams</strong> take part (and the min and max members per
          team), the entry fee and how many can register.
        </p>
      ) : null}
      <SubmitButton pending={pending} pendingText="Saving…" variant={mode === "create" ? "brand" : "default"} className="sm:justify-self-start">
        {mode === "create"
          ? format === "festival"
            ? "Create draft & add sessions"
            : format === "competition"
              ? "Create draft & set up the competition"
              : "Create draft & add tickets"
          : "Save event details"}
      </SubmitButton>
    </form>
  );
}
