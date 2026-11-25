import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-blue-50 text-blue-800 ring-blue-200",
  success: "bg-brand-soft text-brand-strong ring-emerald-200",
  warning: "bg-warning-soft text-warning ring-amber-200",
  danger: "bg-danger-soft text-red-800 ring-red-200",
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  // orders
  awaiting_payment: { label: "Awaiting payment", tone: "warning" },
  under_review: { label: "Review mein hai", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
  // tickets
  valid: { label: "Valid", tone: "success" },
  checked_in: { label: "Used", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
  // events
  draft: { label: "Draft", tone: "neutral" },
  pending_review: { label: "Waiting for approval", tone: "info" },
  published: { label: "Published", tone: "success" },
  // societies
  pending: { label: "Pending approval", tone: "info" },
  suspended: { label: "Suspended", tone: "danger" },
  // disputes
  open: { label: "Open", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  // emails
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  logged: { label: "Logged (no API key)", tone: "neutral" },
};

export function StatusBadge({ status, className, label }: { status: string; className?: string; label?: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        TONES[s.tone],
        className,
      )}
    >
      {label ?? s.label}
    </span>
  );
}

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
