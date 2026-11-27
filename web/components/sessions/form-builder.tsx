"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Eye, EyeOff, Lock, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { FormRenderer } from "@/components/sessions/form-renderer";
import { cn } from "@/lib/utils";
import {
  FIELD_TYPES,
  FORM_TEMPLATES,
  MAX_FIELDS,
  asForm,
  looksSensitive,
  newFieldId,
  type Answers,
  type FieldType,
  type FormField,
  type RegistrationForm,
} from "@/lib/registration-form";

export interface FormSource {
  id: string;
  label: string;
  form: unknown;
}

type Scope = "member" | "team";

/** D-068: Google-Form-like builder for a competition's registration form. */
export function FormBuilder({
  value,
  onChange,
  solo,
  sources,
  locked,
  saved,
}: {
  value: RegistrationForm;
  onChange: (f: RegistrationForm) => void;
  solo: boolean;
  /** other competitions of this society, to copy their form */
  sources: FormSource[];
  /** people registered: fields can be hidden, not removed; new fields stay optional */
  locked: boolean;
  /** the form as saved (to know which fields people already answered) */
  saved?: RegistrationForm | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<{ member: Answers; team: Answers }>({ member: {}, team: {} });
  const total = value.member.length + value.team.length;

  const setScope = (scope: Scope, fields: FormField[]) => onChange({ ...value, [scope]: fields });
  const update = (scope: Scope, id: string, change: Partial<FormField>) => setScope(scope, value[scope].map((f) => (f.id === id ? { ...f, ...change } : f)));
  const move = (scope: Scope, i: number, d: -1 | 1) => {
    const list = [...value[scope]];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    // a condition must point at an earlier field: drop the ones that no longer do
    setScope(
      scope,
      list.map((f, k) => (f.show_if && !list.slice(0, k).some((x) => x.id === f.show_if!.field) ? { ...f, show_if: null } : f)),
    );
  };
  const add = (scope: Scope) => {
    const f: FormField = { id: newFieldId(), type: "short_text", label: "", required: false, hidden: false };
    setScope(scope, [...value[scope], f]);
    setOpen(f.id);
  };
  const remove = (scope: Scope, id: string) =>
    setScope(
      scope,
      value[scope].filter((f) => f.id !== id).map((f) => (f.show_if?.field === id ? { ...f, show_if: null } : f)),
    );
  const applyTemplate = (key: string) => {
    const t = FORM_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    if (locked) return;
    onChange(t.build());
  };
  const copyFrom = (id: string) => {
    const src = sources.find((s) => s.id === id);
    if (!src || locked) return;
    // fresh ids for custom fields so answers never mix between competitions
    const map = new Map<string, string>();
    const f = asForm(src.form);
    const remap = (list: FormField[]) =>
      list.map((x) => {
        const nid = x.builtin ? x.id : (map.get(x.id) ?? newFieldId());
        map.set(x.id, nid);
        return { ...x, id: nid };
      });
    const member = remap(f.member);
    const team = remap(f.team);
    const fixCond = (list: FormField[]) => list.map((x) => (x.show_if ? { ...x, show_if: { ...x.show_if, field: map.get(x.show_if.field) ?? x.show_if.field } } : x));
    onChange({ member: fixCond(member), team: fixCond(team) });
  };

  const section = (scope: Scope, title: string, hint: string) => (
    <div className="grid gap-2">
      <div>
        <p className="text-sm font-semibold text-navy">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {value[scope].map((f, i) => (
        <FieldRow
          key={f.id}
          field={f}
          earlier={value[scope].slice(0, i)}
          open={open === f.id}
          savedField={locked ? ([...(saved?.member ?? []), ...(saved?.team ?? [])].find((x) => x.id === f.id) ?? null) : undefined}
          onToggle={() => setOpen(open === f.id ? null : f.id)}
          onChange={(c) => update(scope, f.id, c)}
          onUp={() => move(scope, i, -1)}
          onDown={() => move(scope, i, 1)}
          onRemove={() => remove(scope, f.id)}
        />
      ))}
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => add(scope)} disabled={total >= MAX_FIELDS}>
        <Plus /> Add field
      </Button>
    </div>
  );

  return (
    <fieldset className="grid gap-4 rounded-xl border border-navy/10 p-3">
      <legend className="px-1 text-sm font-semibold text-navy">📝 Registration form</legend>
      {locked ? (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft p-2 text-xs text-navy">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          People have registered: you can add optional fields, rename and hide fields, but not remove fields, change their type or make them required.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Start from:</span>
          {FORM_TEMPLATES.map((t) => (
            <Button key={t.key} type="button" variant="outline" size="sm" onClick={() => applyTemplate(t.key)}>
              {t.label}
            </Button>
          ))}
          {sources.length ? (
            <NativeSelect aria-label="Copy the form of another competition" value="" onChange={(e) => copyFrom(e.target.value)} className="h-9 w-auto max-w-full min-w-0 sm:max-w-xs">
              <option value="">Copy from a previous competition…</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          ) : null}
        </div>
      )}

      {section("member", solo ? "Asked from the participant" : "Asked for every participant", "Name is always asked. Mobile, university, email and roll no come built in – rename, hide or make them optional.")}
      {section("team", solo ? "Extra questions (asked once)" : "Asked once per team", solo ? "e.g. how they heard about it." : "e.g. project idea, GitHub link, coach's name.")}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {total}/{MAX_FIELDS} fields
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
          {preview ? <EyeOff /> : <Eye />} {preview ? "Hide preview" : "Preview the form"}
        </Button>
      </div>
      {preview ? (
        <div className="grid gap-3 rounded-xl bg-secondary/50 p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">What participants see</p>
          <div className="grid gap-2 rounded-xl bg-white p-3">
            <p className="text-sm font-medium text-navy">{solo ? "Participant" : "Member 1"}</p>
            <FormRenderer fields={value.member} answers={previewAnswers.member} errors={{}} prefix="pv-m" preview onChange={(id, v) => setPreviewAnswers((a) => ({ ...a, member: { ...a.member, [id]: v } }))} />
          </div>
          {value.team.some((f) => !f.hidden) ? (
            <div className="grid gap-2 rounded-xl bg-white p-3">
              <p className="text-sm font-medium text-navy">{solo ? "A few more details" : "About your team"}</p>
              <FormRenderer fields={value.team} answers={previewAnswers.team} errors={{}} prefix="pv-t" preview onChange={(id, v) => setPreviewAnswers((a) => ({ ...a, team: { ...a.team, [id]: v } }))} />
            </div>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

function FieldRow({
  field: f,
  earlier,
  open,
  savedField,
  onToggle,
  onChange,
  onUp,
  onDown,
  onRemove,
}: {
  field: FormField;
  earlier: FormField[];
  open: boolean;
  /** undefined: nobody registered yet; null: a new field; else the saved version of this field */
  savedField?: FormField | null;
  onToggle: () => void;
  onChange: (c: Partial<FormField>) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const isName = f.id === "name";
  const existing = Boolean(savedField);
  // once people registered, a field may only be required if it already was
  const canRequire = savedField === undefined || Boolean(savedField && savedField.required && !savedField.hidden);
  const choiceSources = earlier.filter((x) => ["select", "multi", "yes_no"].includes(x.type) && !x.hidden);
  const condTarget = choiceSources.find((x) => x.id === f.show_if?.field);
  const condOptions = condTarget ? (condTarget.type === "yes_no" ? ["yes", "no"] : (condTarget.options ?? [])) : [];
  return (
    <div className={cn("grid gap-2 rounded-xl border p-2", f.hidden ? "border-dashed border-navy/15 bg-secondary/40" : "border-navy/10 bg-white")}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Field label"
          value={f.label}
          onChange={(e) => onChange({ label: e.target.value })}
          maxLength={120}
          placeholder="Question, e.g. GitHub link"
          className="h-9 min-w-0 flex-1 basis-48"
        />
        <NativeSelect
          aria-label="Field type"
          value={f.type}
          disabled={Boolean(f.builtin) || existing}
          onChange={(e) => onChange({ type: e.target.value as FieldType, options: ["select", "multi"].includes(e.target.value) ? (f.options?.length ? f.options : ["Option 1"]) : undefined })}
          className="h-9 w-auto min-w-0 basis-40"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Required, optional or hidden"
          value={f.hidden ? "hidden" : f.required ? "required" : "optional"}
          disabled={isName}
          onChange={(e) => onChange({ hidden: e.target.value === "hidden", required: e.target.value === "required" })}
          className="h-9 w-auto min-w-0 basis-28"
        >
          <option value="required" disabled={!canRequire && !isName}>
            Required
          </option>
          <option value="optional">Optional</option>
          <option value="hidden">Hidden</option>
        </NativeSelect>
        <div className="flex items-center">
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Move up" onClick={onUp}>
            <ArrowUp />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Move down" onClick={onDown}>
            <ArrowDown />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={open ? "Fewer settings" : "More settings"} onClick={onToggle}>
            {open ? <ChevronUp /> : <ChevronDown />}
          </Button>
          {f.builtin || existing ? null : (
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${f.label || "field"}`} onClick={onRemove}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      {looksSensitive(f.label) ? (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <ShieldAlert className="size-3.5 shrink-0" aria-hidden /> Sensitive detail – only ask if you really need it. Only your team sees the answers.
        </p>
      ) : null}
      {open ? (
        <div className="grid gap-2 border-t pt-2 sm:grid-cols-2">
          <Input aria-label="Help text" value={f.help ?? ""} onChange={(e) => onChange({ help: e.target.value })} maxLength={300} placeholder="Help text (optional)" className="h-9 sm:col-span-2" />
          {f.type === "select" || f.type === "multi" ? (
            <Textarea
              aria-label="Options, one per line"
              value={(f.options ?? []).join("\n")}
              onChange={(e) => onChange({ options: e.target.value.split("\n").map((o) => o.slice(0, 100)).slice(0, 20) })}
              onBlur={() => onChange({ options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) })}
              rows={3}
              placeholder={"One option per line"}
              className="sm:col-span-2"
            />
          ) : null}
          {f.type === "number" || f.type === "short_text" || f.type === "long_text" ? (
            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
              <Input
                aria-label={f.type === "number" ? "Smallest number" : "Fewest characters"}
                type="number"
                value={f.min ?? ""}
                onChange={(e) => onChange({ min: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder={f.type === "number" ? "Min number" : "Min characters"}
                className="h-9"
              />
              <Input
                aria-label={f.type === "number" ? "Largest number" : "Most characters"}
                type="number"
                value={f.max ?? ""}
                onChange={(e) => onChange({ max: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder={f.type === "number" ? "Max number" : "Max characters"}
                className="h-9"
              />
            </div>
          ) : null}
          {choiceSources.length && !f.builtin ? (
            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
              <NativeSelect
                aria-label="Show only when"
                value={f.show_if?.field ?? ""}
                onChange={(e) => onChange({ show_if: e.target.value ? { field: e.target.value, equals: "" } : null })}
                className="h-9"
              >
                <option value="">Always show</option>
                {choiceSources.map((x) => (
                  <option key={x.id} value={x.id}>
                    Only if “{x.label || "untitled"}” is…
                  </option>
                ))}
              </NativeSelect>
              {f.show_if ? (
                <NativeSelect aria-label="Answer that shows this field" value={f.show_if.equals} onChange={(e) => onChange({ show_if: { field: f.show_if!.field, equals: e.target.value } })} className="h-9">
                  <option value="">Choose the answer…</option>
                  {condOptions.map((o) => (
                    <option key={o} value={o}>
                      {o === "yes" ? "Yes" : o === "no" ? "No" : o}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
