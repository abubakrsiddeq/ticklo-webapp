"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Fill } from "@/lib/print/design";

/** "#abc", "#aabbcc", "rgb(…)", "rgba(…)" → "#aabbcc" for <input type="color">. */
export function toHex(c: string | undefined): string {
  if (!c) return "#000000";
  const s = c.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
  return "#000000";
}

export function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[88px_1fr] items-center gap-2", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ColorField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="color"
        aria-label={label}
        value={toHex(value)}
        onChange={(e) => onChange(e.target.value)}
        className="size-9 shrink-0 cursor-pointer rounded-lg border border-input bg-white p-0.5"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 font-mono text-xs" aria-label={`${label} (code)`} maxLength={40} />
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  label: string;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : ""}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(n);
        }}
        className={cn("h-9 text-sm", suffix ? "pr-9" : "")}
      />
      {suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span> : null}
    </div>
  );
}

export function Toggle({ pressed, onClick, children, label }: { pressed: boolean; onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2 text-sm transition-colors",
        pressed ? "border-brand bg-brand-soft text-brand-strong" : "border-input bg-white text-navy hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Solid colour or two-colour gradient. */
export function FillField({ value, onChange, label }: { value: Fill; onChange: (v: Fill) => void; label: string }) {
  const gradient = typeof value !== "string";
  const first = gradient ? value.stops[0][1] : value;
  const last = gradient ? value.stops[value.stops.length - 1][1] : value;
  return (
    <div className="grid gap-2">
      <div className="flex gap-1">
        <Toggle pressed={!gradient} onClick={() => gradient && onChange(first)} label="Solid colour">
          Solid
        </Toggle>
        <Toggle
          pressed={gradient}
          onClick={() => !gradient && onChange({ type: "linear", angle: 0, stops: [[0, first], [1, toHex(first) === "#ffffff" ? "#0f9d58" : "#ffffff"]] })}
          label="Gradient"
        >
          Gradient
        </Toggle>
      </div>
      {gradient ? (
        <>
          <ColorField label={`${label} start`} value={first} onChange={(c) => onChange({ ...value, stops: [[0, c], ...value.stops.slice(1)] })} />
          <ColorField
            label={`${label} end`}
            value={last}
            onChange={(c) => onChange({ ...value, stops: [...value.stops.slice(0, -1), [1, c]] })}
          />
          <Row label="Angle">
            <NumberField label="Gradient angle" value={value.angle} step={15} suffix="°" onChange={(a) => onChange({ ...value, angle: a })} />
          </Row>
        </>
      ) : (
        <ColorField label={label} value={value} onChange={onChange} />
      )}
    </div>
  );
}
