"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, IdCard, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField, fieldAria } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { submitPaymentProof } from "../actions";
import { paymentProofSchema } from "@/lib/validation/payments";
import { fieldErrors } from "@/lib/validation/common";

const MAX = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

function checkFile(f: File | undefined, label: string, required: boolean): string | null {
  if (!f || f.size === 0) return required ? `${label} is required.` : null;
  if (f.size > MAX) return `${label} must be 5 MB or smaller.`;
  if (f.type && !TYPES.includes(f.type)) return `${label} must be a JPG, PNG or WebP image.`;
  return null;
}

function FilePicker({
  id,
  name,
  label,
  icon: Icon,
  error,
  hint,
  required,
}: {
  id: string;
  name: string;
  label: string;
  icon: typeof ImageUp;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <FormField id={id} label={label} error={error} hint={hint} required={required}>
      <label
        htmlFor={id}
        className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-white p-4 text-center text-sm hover:border-brand focus-within:ring-3 focus-within:ring-ring/50"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Selected file preview" className="max-h-48 rounded-md object-contain" />
        ) : (
          <>
            <Icon className="size-7 text-muted-foreground" aria-hidden />
            <span className="font-medium text-navy">Tap to choose an image</span>
            <span className="text-xs text-muted-foreground">JPG, PNG or WebP · up to 5 MB</span>
          </>
        )}
      </label>
      <input
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        {...fieldAria(id, error, Boolean(hint))}
        onChange={(e) => {
          const f = e.target.files?.[0];
          setPreview((old) => {
            if (old) URL.revokeObjectURL(old);
            return f ? URL.createObjectURL(f) : null;
          });
        }}
      />
    </FormField>
  );
}

export function ProofForm(props: {
  orderId: string;
  paid: boolean;
  requiresCard: boolean;
  accounts: { id: string; label: string }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  function submit(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const errs: Record<string, string> = {};
    const shotErr = checkFile(fd.get("screenshot") as File, "Payment screenshot", props.paid);
    if (shotErr) errs.screenshot = shotErr;
    const cardErr = checkFile(fd.get("student_card") as File, "Student card photo", props.requiresCard);
    if (cardErr) errs.student_card = cardErr;
    const text = paymentProofSchema.safeParse({
      transaction_id: String(fd.get("transaction_id") ?? ""),
      sender_name: String(fd.get("sender_name") ?? ""),
      payment_account_id: String(fd.get("payment_account_id") ?? ""),
    });
    if (!text.success) Object.assign(errs, fieldErrors(text.error));
    if (props.paid) {
      if (!errs.transaction_id && String(fd.get("transaction_id") ?? "").trim().length < 4) errs.transaction_id = "Enter the transaction ID from your bank app.";
      if (!errs.sender_name && String(fd.get("sender_name") ?? "").trim().length < 2) errs.sender_name = "Enter the name of the account you paid from.";
      if (props.accounts.length > 1 && !fd.get("payment_account_id")) errs.payment_account_id = "Choose the account you sent money to.";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    start(async () => {
      try {
        const res = await submitPaymentProof(props.orderId, fd);
        if (!res.ok) {
          setErrors(res.fieldErrors ?? {});
          setFailed(true);
          toast.error(res.error);
          return;
        }
        toast.success("Uploaded! The organizer will review your payment.");
        router.push(`/checkout/${props.orderId}/status`);
      } catch {
        // NFR-13: network failure → keep the form, offer retry
        setFailed(true);
        toast.error("Upload failed – check your internet and try again.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-4" noValidate encType="multipart/form-data">
      {props.paid ? (
        <>
          <FilePicker id="screenshot" name="screenshot" label="Payment screenshot" icon={ImageUp} error={errors.screenshot} required />
          {props.accounts.length > 1 ? (
            <FormField id="payment_account_id" label="Which account did you pay into?" error={errors.payment_account_id} required>
              <NativeSelect name="payment_account_id" defaultValue="" {...fieldAria("payment_account_id", errors.payment_account_id)}>
                <option value="" disabled>
                  Choose account
                </option>
                {props.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : (
            <input type="hidden" name="payment_account_id" value={props.accounts[0]?.id ?? ""} />
          )}
          <FormField id="transaction_id" label="Transaction ID" hint="Shown on your bank/wallet receipt (TID / reference no.)" error={errors.transaction_id} required>
            <Input name="transaction_id" maxLength={60} autoComplete="off" autoCapitalize="characters" {...fieldAria("transaction_id", errors.transaction_id, true)} />
          </FormField>
          <FormField id="sender_name" label="Sender's name" hint="Name on the account the money came from" error={errors.sender_name} required>
            <Input name="sender_name" maxLength={100} autoComplete="name" {...fieldAria("sender_name", errors.sender_name, true)} />
          </FormField>
        </>
      ) : (
        <input type="hidden" name="payment_account_id" value="" />
      )}
      {props.requiresCard ? (
        <FilePicker
          id="student_card"
          name="student_card"
          label="Student card photo"
          icon={IdCard}
          hint="Your ticket type needs a student card. Bring the same card to the gate."
          error={errors.student_card}
          required
        />
      ) : null}
      <SubmitButton pending={pending} pendingText="Uploading…" variant="brand" size="lg" className="w-full">
        Submit for review
      </SubmitButton>
      {failed && !pending ? (
        <Button type="button" variant="outline" onClick={() => submit()} className="w-full">
          <RotateCcw /> Try again
        </Button>
      ) : null}
    </form>
  );
}
