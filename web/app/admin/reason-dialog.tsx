"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormField, fieldAria } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/errors";
import { useActionTransition } from "@/lib/use-action-transition";

export interface ReasonValues {
  reason: string;
  checked: boolean;
  confirm: string;
}

/**
 * D-084: a button that opens a dialog asking for a reason (kept in the audit log),
 * optionally a checkbox and a typed confirmation, then runs an admin action.
 */
export function ReasonDialog({
  triggerLabel,
  triggerVariant = "outline",
  triggerClassName,
  size = "sm",
  title,
  description,
  reasonLabel = "Reason",
  reasonHint,
  reasonPlaceholder,
  reasonRequired = true,
  checkboxLabel,
  confirmWord,
  confirmLabel,
  submitLabel,
  destructive,
  onSubmit,
  redirectTo,
}: {
  triggerLabel: React.ReactNode;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerClassName?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  title: string;
  description?: React.ReactNode;
  reasonLabel?: string | null;
  reasonHint?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
  checkboxLabel?: React.ReactNode;
  confirmWord?: string;
  confirmLabel?: React.ReactNode;
  submitLabel: string;
  destructive?: boolean;
  onSubmit: (values: ReasonValues) => Promise<ActionResult<unknown>>;
  redirectTo?: string | ((res: ActionResult<unknown>) => string | null);
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<ReasonValues>({ reason: "", checked: false, confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useActionTransition();
  const confirmOk = !confirmWord || v.confirm.trim().toLowerCase() === confirmWord.trim().toLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setV({ reason: "", checked: false, confirm: "" });
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size={size} variant={triggerVariant} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reasonLabel && reasonRequired && v.reason.trim().length < 3) {
              setErrors({ reason: "Write at least a few words" });
              return;
            }
            start(async () => {
              const res = await onSubmit(v);
              if (res.ok) {
                toast.success(res.message ?? "Done");
                setOpen(false);
                const to = typeof redirectTo === "function" ? redirectTo(res) : redirectTo;
                if (to) router.push(to);
                else router.refresh();
              } else {
                const fe = res.fieldErrors ?? {};
                setErrors({ reason: fe.reason ?? fe.note ?? "", confirm: fe.confirm ?? fe.confirmName ?? "" });
                toast.error(res.error);
              }
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription asChild><div className="grid gap-2 text-sm">{description}</div></DialogDescription> : null}
          </DialogHeader>
          {reasonLabel ? (
            <FormField id={`${id}-reason`} label={reasonLabel} hint={reasonHint ?? "Saved in the audit log."} error={errors.reason || undefined} required={reasonRequired}>
              <Textarea
                {...fieldAria(`${id}-reason`, errors.reason || undefined, true)}
                value={v.reason}
                onChange={(e) => setV({ ...v, reason: e.target.value })}
                placeholder={reasonPlaceholder}
                maxLength={1000}
                rows={3}
              />
            </FormField>
          ) : null}
          {checkboxLabel ? (
            <Label className="flex items-start gap-3 text-sm font-normal text-navy">
              <Checkbox checked={v.checked} onCheckedChange={(c) => setV({ ...v, checked: c === true })} className="mt-0.5" />
              <span>{checkboxLabel}</span>
            </Label>
          ) : null}
          {confirmWord ? (
            <FormField
              id={`${id}-confirm`}
              label={confirmLabel ?? <>Type <strong>{confirmWord}</strong> to confirm</>}
              error={errors.confirm || undefined}
              required
            >
              <Input
                {...fieldAria(`${id}-confirm`, errors.confirm || undefined)}
                value={v.confirm}
                onChange={(e) => setV({ ...v, confirm: e.target.value })}
                autoComplete="off"
              />
            </FormField>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pending={pending} disabled={!confirmOk} variant={destructive ? "destructive" : "default"}>
              {submitLabel}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
