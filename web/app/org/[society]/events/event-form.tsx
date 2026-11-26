"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, fieldAria } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { eventSchema, type EventInput } from "@/lib/validation/event";
import type { ActionResult } from "@/lib/errors";

// ORG-04: name, description, poster, venue, start/end (PKT), capacity, visibility, max per order
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
      <FormField id="name" label="Event name" error={errors.name?.message} required>
        <Input {...fieldAria("name", errors.name?.message)} {...form.register("name")} />
      </FormField>
      <FormField id="description" label="Description" error={errors.description?.message}>
        <Textarea rows={6} {...fieldAria("description", errors.description?.message)} {...form.register("description")} />
      </FormField>
      <FormField id="venue" label="Venue" error={errors.venue?.message} required>
        <Input placeholder="e.g. Main Auditorium, LUMS" {...fieldAria("venue", errors.venue?.message)} {...form.register("venue")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="starts_at" label="Starts (Pakistan time)" error={errors.starts_at?.message} required>
          <Input type="datetime-local" {...fieldAria("starts_at", errors.starts_at?.message)} {...form.register("starts_at")} />
        </FormField>
        <FormField id="ends_at" label="Ends (Pakistan time)" error={errors.ends_at?.message} required>
          <Input type="datetime-local" {...fieldAria("ends_at", errors.ends_at?.message)} {...form.register("ends_at")} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="capacity" label="Capacity" hint="Total people allowed in." error={errors.capacity?.message} required>
          <Input type="number" inputMode="numeric" min={1} {...fieldAria("capacity", errors.capacity?.message, true)} {...form.register("capacity")} />
        </FormField>
        <FormField id="max_tickets_per_order" label="Max tickets per order" error={errors.max_tickets_per_order?.message} required>
          <Input type="number" inputMode="numeric" min={1} max={20} {...fieldAria("max_tickets_per_order", errors.max_tickets_per_order?.message)} {...form.register("max_tickets_per_order")} />
        </FormField>
        <FormField id="visibility" label="Visibility" error={errors.visibility?.message} required>
          <NativeSelect {...fieldAria("visibility", errors.visibility?.message)} {...form.register("visibility")}>
            <option value="public">Public – listed on TickLO</option>
            <option value="link_only">Link only – not listed</option>
          </NativeSelect>
        </FormField>
      </div>
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
      <SubmitButton pending={pending} pendingText="Saving…" variant={mode === "create" ? "brand" : "default"} className="sm:justify-self-start">
        {mode === "create" ? "Create draft & add tickets" : "Save event details"}
      </SubmitButton>
    </form>
  );
}
