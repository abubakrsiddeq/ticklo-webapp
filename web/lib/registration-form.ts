import { normalizePhone } from "@/lib/phone";
import { PHONE_HINT } from "@/lib/phone";
import { hasControlChars, isEmail, isWebLink, normalizeLink, personNameProblem, teamNameProblem } from "@/lib/validation/common";

// D-068: registration form builder for competitions. Mirrors validate_form_answers /
// clean_members_form / set_session_form in Postgres (the database checks everything again).

export const FIELD_TYPES = [
  { key: "short_text", label: "Short text" },
  { key: "long_text", label: "Paragraph" },
  { key: "number", label: "Number" },
  { key: "select", label: "Dropdown (one choice)" },
  { key: "multi", label: "Checkboxes (many choices)" },
  { key: "yes_no", label: "Yes / No" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Mobile number" },
  { key: "url", label: "Link (GitHub, portfolio…)" },
  { key: "date", label: "Date" },
  { key: "file", label: "File upload (PDF or image)" },
] as const;
export type FieldType = (typeof FIELD_TYPES)[number]["key"];

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  required: boolean;
  hidden: boolean;
  options?: string[];
  min?: number | null;
  max?: number | null;
  show_if?: { field: string; equals: string } | null;
  builtin?: boolean;
}

export interface RegistrationForm {
  member: FormField[];
  team: FormField[];
}

export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue>;

export const BUILTIN_MEMBER_IDS = ["name", "phone", "email", "roll_no", "university"] as const;
export const isBuiltin = (id: string) => (BUILTIN_MEMBER_IDS as readonly string[]).includes(id);
export const MAX_FIELDS = 25;
const SENSITIVE = /cnic|nic\b|id card number|gender|religion|address|ghar|blood/i;
export const looksSensitive = (label: string) => SENSITIVE.test(label);

export const DEFAULT_FORM: RegistrationForm = {
  member: [
    { id: "name", type: "short_text", label: "Full name", required: true, hidden: false, builtin: true },
    { id: "phone", type: "phone", label: "Mobile number", required: true, hidden: false, builtin: true },
    { id: "university", type: "short_text", label: "University", required: true, hidden: false, builtin: true },
    { id: "email", type: "email", label: "Email", required: false, hidden: false, builtin: true },
    { id: "roll_no", type: "short_text", label: "Roll / student ID", required: false, hidden: false, builtin: true },
    { id: "department", type: "short_text", label: "Department / semester", required: false, hidden: true },
  ],
  team: [],
};

export function asForm(v: unknown): RegistrationForm {
  const o = (v && typeof v === "object" ? v : {}) as Partial<RegistrationForm>;
  const member = Array.isArray(o.member) && o.member.length ? (o.member as FormField[]) : DEFAULT_FORM.member;
  return { member, team: Array.isArray(o.team) ? (o.team as FormField[]) : [] };
}

export const newFieldId = () => `f_${Math.random().toString(36).slice(2, 10)}`;

/** Templates: the default member details plus fields for the kind of competition. */
export const FORM_TEMPLATES: { key: string; label: string; build: () => RegistrationForm }[] = [
  {
    key: "hackathon",
    label: "💻 Hackathon",
    build: () => ({
      member: DEFAULT_FORM.member.map((f) => (f.id === "email" ? { ...f, required: true } : f)),
      team: [
        { id: newFieldId(), type: "url", label: "GitHub / portfolio link", required: false, hidden: false },
        { id: newFieldId(), type: "short_text", label: "Tech stack", help: "e.g. React, Python, Firebase", required: false, hidden: false },
        { id: newFieldId(), type: "long_text", label: "Project idea", required: true, hidden: false, max: 1000 },
      ],
    }),
  },
  {
    key: "mun",
    label: "🌐 MUN",
    build: () => {
      const exp = newFieldId();
      return {
        member: [
          ...DEFAULT_FORM.member,
          { id: newFieldId(), type: "select", label: "Committee preference", required: true, hidden: false, options: ["UNSC", "UNGA", "UNHRC", "WHO", "Crisis"] },
          { id: newFieldId(), type: "short_text", label: "Country preference", required: false, hidden: false },
          { id: exp, type: "yes_no", label: "Have you done MUN before?", required: true, hidden: false },
          { id: newFieldId(), type: "number", label: "How many MUNs?", required: false, hidden: false, min: 1, max: 100, show_if: { field: exp, equals: "yes" } },
        ],
        team: [],
      };
    },
  },
  {
    key: "sports",
    label: "⚽ Sports",
    build: () => ({
      member: [
        ...DEFAULT_FORM.member,
        { id: newFieldId(), type: "number", label: "Jersey number", required: false, hidden: false, min: 0, max: 99 },
        { id: newFieldId(), type: "select", label: "Position", required: false, hidden: false, options: ["Goalkeeper", "Defender", "Midfielder", "Forward"] },
      ],
      team: [
        { id: newFieldId(), type: "short_text", label: "Coach / manager name", required: false, hidden: false },
        { id: newFieldId(), type: "phone", label: "Emergency contact", required: true, hidden: false },
      ],
    }),
  },
  { key: "basic", label: "🧠 Quiz / speech (basic)", build: () => ({ member: DEFAULT_FORM.member.map((f) => ({ ...f })), team: [] }) },
];

/** Is a field shown, given the answers so far (conditions look at an earlier choice question)? */
export function isShown(f: FormField, answers: Answers): boolean {
  if (f.hidden) return false;
  if (!f.show_if) return true;
  const v = answers[f.show_if.field];
  return Array.isArray(v) ? v.includes(f.show_if.equals) : v === f.show_if.equals;
}

const FILE_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/;

/** A real calendar date (YYYY-MM-DD, no 31 February) between 1900 and 2100. */
function isRealDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1900 && y <= 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Field errors for one set of answers (a member or the team). Mirrors validate_form_answers in Postgres. */
export function checkAnswers(fields: FormField[], answers: Answers): Record<string, string> {
  const e: Record<string, string> = {};
  for (const f of fields) {
    if (!isShown(f, answers)) continue;
    const raw = answers[f.id];
    if (f.type === "multi") {
      const arr = Array.isArray(raw) ? raw.filter((x) => x.trim()) : [];
      if (!arr.length) {
        if (f.required) e[f.id] = "Choose at least one";
      } else if (arr.some((x) => !(f.options ?? []).includes(x.trim()))) e[f.id] = "Choose from the list";
      continue;
    }
    const v = (typeof raw === "string" ? raw : "").trim();
    if (!v) {
      if (f.required) e[f.id] = "Required";
      continue;
    }
    if (hasControlChars(v)) {
      e[f.id] = "Remove the special characters";
      continue;
    }
    const max = f.id === "name" ? 80 : f.id === "roll_no" ? 40 : f.id === "university" ? 120 : f.type === "long_text" ? Math.min(f.max ?? 2000, 2000) : f.type === "short_text" ? Math.min(f.max ?? 200, 300) : 300;
    if ((f.type === "short_text" || f.type === "long_text") && v.length > max) e[f.id] = `At most ${max} characters`;
    else if ((f.type === "short_text" || f.type === "long_text") && f.min && v.length < f.min) e[f.id] = `At least ${f.min} characters`;
    if (f.id === "name") {
      const problem = personNameProblem(v, 2, 80);
      if (problem) e[f.id] = problem;
    }
    if (f.id === "roll_no" && !/^[\p{L}\p{N}][\p{L}\p{N} ./_-]*$/u.test(v)) e[f.id] = "Letters, numbers, - / . only";
    if (f.id === "university" && !/\p{L}/u.test(v)) e[f.id] = "Enter the university name";
    if (f.type === "number") {
      const n = Number(v);
      if (!/^-?\d{1,12}(\.\d{1,4})?$/.test(v)) e[f.id] = "Enter a number";
      else if ((f.min != null && n < f.min) || (f.max != null && n > f.max)) e[f.id] = `Between ${f.min ?? "…"} and ${f.max ?? "…"}`;
    }
    if (f.type === "email" && !isEmail(v, 120)) e[f.id] = "Enter a valid email, e.g. name@gmail.com";
    if (f.type === "phone" && !normalizePhone(v)) e[f.id] = PHONE_HINT;
    if (f.type === "url" && !isWebLink(normalizeLink(v))) e[f.id] = "Enter a full link, e.g. https://github.com/yourname";
    if (f.type === "date" && !isRealDate(v)) e[f.id] = "Pick a valid date";
    if (f.type === "select" && !(f.options ?? []).includes(v)) e[f.id] = "Choose from the list";
    if (f.type === "yes_no" && v !== "yes" && v !== "no") e[f.id] = "Choose Yes or No";
    if (f.type === "file" && !FILE_PATH.test(v)) e[f.id] = "Upload the file again";
  }
  return e;
}

/**
 * A whole registration: team name, every member's answers, the same person not listed twice
 * (same mobile number or email, as Postgres refuses), and the team's answers.
 * Keys: "team", "m{i}-{field}", "t-{field}".
 */
export function checkRegistration(
  form: RegistrationForm,
  members: Answers[],
  teamAnswers: Answers,
  teamName: string | null,
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (teamName !== null) {
    const problem = teamNameProblem(teamName);
    if (problem) errs.team = problem;
  }
  const phones = new Map<string, number>();
  const emails = new Map<string, number>();
  members.forEach((m, i) => {
    for (const [k, v] of Object.entries(checkAnswers(form.member, m))) errs[`m${i}-${k}`] = v;
    const shown = (id: string) => form.member.find((f) => f.id === id && isShown(f, m));
    const phone = shown("phone") && typeof m.phone === "string" ? normalizePhone(m.phone) : null;
    const email = shown("email") && typeof m.email === "string" ? m.email.trim().toLowerCase() : "";
    if (phone) {
      if (phones.has(phone) && !errs[`m${i}-phone`]) errs[`m${i}-phone`] = `Same number as member ${phones.get(phone)! + 1}`;
      else phones.set(phone, i);
    }
    if (email) {
      if (emails.has(email) && !errs[`m${i}-email`]) errs[`m${i}-email`] = `Same email as member ${emails.get(email)! + 1}`;
      else emails.set(email, i);
    }
  });
  for (const [k, v] of Object.entries(checkAnswers(form.team, teamAnswers))) errs[`t-${k}`] = v;
  return errs;
}

/** A typed answer as it is sent: phones as +92…, emails lower-case, links with https://. */
function cleanValue(f: FormField, v: string): string {
  const t = v.trim();
  if (f.type === "phone") return normalizePhone(t) ?? t;
  if (f.type === "email") return t.toLowerCase();
  if (f.type === "url") return normalizeLink(t);
  return t;
}

/** What is sent for a member: built-in keys on the member, the rest in answers (phones normalised). */
export function memberPayload(fields: FormField[], answers: Answers) {
  const out: Record<string, unknown> = { answers: {} as Answers };
  for (const f of fields) {
    if (!isShown(f, answers)) continue;
    let v = answers[f.id];
    if (v === undefined || (typeof v === "string" && !v.trim())) continue;
    if (typeof v === "string") v = cleanValue(f, v);
    if (isBuiltin(f.id)) out[f.id] = v;
    else (out.answers as Answers)[f.id] = v;
  }
  if (!out.name) out.name = typeof answers.name === "string" ? answers.name.trim() : "";
  return out;
}

export function teamPayload(fields: FormField[], answers: Answers): Answers {
  const out: Answers = {};
  for (const f of fields) {
    if (!isShown(f, answers)) continue;
    const v = answers[f.id];
    if (v === undefined || (typeof v === "string" && !v.trim())) continue;
    out[f.id] = typeof v === "string" ? cleanValue(f, v) : v;
  }
  return out;
}

/** A stored member back to flat answers (for editing). */
export function memberToAnswers(m: Record<string, unknown>): Answers {
  const a: Answers = { ...((m.answers as Answers) ?? {}) };
  for (const k of BUILTIN_MEMBER_IDS) if (typeof m[k] === "string") a[k] = m[k] as string;
  return a;
}

/** Readable answer for lists and CSV. */
export function answerLabel(f: FormField, v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (f.type === "yes_no") return v === "yes" ? "Yes" : v === "no" ? "No" : String(v);
  if (f.type === "file") return "File attached";
  return String(v);
}

/** Problems with the form itself (shown in the builder before saving). */
export function checkForm(form: RegistrationForm, mode: "competition" | "ticket" = "competition"): string | null {
  const all = [...form.member, ...form.team];
  if (all.length > MAX_FIELDS) return `A form can have at most ${MAX_FIELDS} fields.`;
  const ids = new Set<string>();
  for (const scope of ["member", "team"] as const) {
    const seen: FormField[] = [];
    for (const f of form[scope]) {
      if (!f.label.trim()) return "Every field needs a label.";
      if (ids.has(f.id)) return "Two fields have the same id.";
      ids.add(f.id);
      if ((f.type === "select" || f.type === "multi") && !(f.options ?? []).filter((o) => o.trim()).length) return `"${f.label}" needs at least one option.`;
      if (f.show_if) {
        const target = seen.find((x) => x.id === f.show_if!.field);
        if (!target || !["select", "multi", "yes_no"].includes(target.type) || !f.show_if.equals) return `"${f.label}" can only depend on an earlier choice question.`;
      }
      seen.push(f);
    }
  }
  if (mode === "competition" && !form.member.some((f) => f.id === "name" && f.required && !f.hidden)) return "Full name is always asked.";
  return null;
}

// ---------------------------------------------------------------------------
// D-069: ticket forms (every session and single / competition events)
// ---------------------------------------------------------------------------
type Level = string | null | undefined;
const builtin = (id: string, type: FieldType, label: string, level: Level): FormField => ({
  id,
  type,
  label,
  builtin: true,
  required: level === "required",
  hidden: !level || level === "off",
});

/** Default ticket form: nothing asked (the buyer's name goes on the ticket). */
export const DEFAULT_TICKET_FIELDS: FormField[] = [
  builtin("name", "short_text", "Name of the person", "off"),
  builtin("university", "short_text", "University", "off"),
  builtin("phone", "phone", "Mobile number", "off"),
  builtin("email", "email", "Email", "off"),
  builtin("roll_no", "short_text", "Roll / student ID", "off"),
];

/** Older settings (D-064 / D-065 name / university, session questions) as a form – mirrors Postgres. */
export function legacyTicketFields(names: Level, university: Level, questions: unknown = []): FormField[] {
  const qs = Array.isArray(questions) ? (questions as { id: string; label: string; type: string; options?: string[]; required?: boolean }[]) : [];
  return [
    builtin("name", "short_text", "Name of the person", names),
    builtin("university", "short_text", "University", university),
    builtin("phone", "phone", "Mobile number", "off"),
    builtin("email", "email", "Email", "off"),
    builtin("roll_no", "short_text", "Roll / student ID", "off"),
    ...qs.map((q) => ({
      id: q.id,
      type: (q.type === "text" ? "short_text" : q.type) as FieldType,
      label: q.label,
      required: Boolean(q.required),
      hidden: false,
      options: q.type === "select" ? q.options : undefined,
    })),
  ];
}

/** A session's ticket form (event_schedule returns {member: fields}). */
export function ticketFieldsOf(form: unknown, fallback: { names?: Level; university?: Level; questions?: unknown }): FormField[] {
  const member = (form as { member?: FormField[] } | null)?.member;
  return Array.isArray(member) && member.length ? member : legacyTicketFields(fallback.names, fallback.university, fallback.questions);
}

export const TICKET_TEMPLATES: { key: string; label: string; build: () => FormField[] }[] = [
  { key: "none", label: "🎟 Buyer's name only", build: () => DEFAULT_TICKET_FIELDS.map((f) => ({ ...f })) },
  {
    key: "named",
    label: "🪪 Name on every ticket",
    build: () => DEFAULT_TICKET_FIELDS.map((f) => (f.id === "name" ? { ...f, hidden: false, required: true } : { ...f })),
  },
  {
    key: "students",
    label: "🎓 Students (name, university, roll no)",
    build: () => DEFAULT_TICKET_FIELDS.map((f) => (["name", "university", "roll_no"].includes(f.id) ? { ...f, hidden: false, required: true } : { ...f })),
  },
  {
    key: "workshop",
    label: "🛠 Workshop",
    build: () => [
      ...DEFAULT_TICKET_FIELDS.map((f) => (["name", "university"].includes(f.id) ? { ...f, hidden: false, required: true } : f.id === "phone" ? { ...f, hidden: false } : { ...f })),
      { id: newFieldId(), type: "yes_no", label: "Will you bring a laptop?", required: true, hidden: false },
      { id: newFieldId(), type: "select", label: "Your level", required: false, hidden: false, options: ["Beginner", "Intermediate", "Advanced"] },
    ],
  },
];

const rank = (f?: FormField) => (!f || f.hidden ? 0 : f.required ? 2 : 1);

/** Built-in details asked once per ticket: the strictest across the forms a ticket asks. */
export function mergeBuiltins(lists: FormField[][]): FormField[] {
  return BUILTIN_MEMBER_IDS.map((id) => {
    const all = lists.map((l) => l.find((f) => f.id === id)).filter((f): f is FormField => Boolean(f));
    const best = all.reduce<FormField | undefined>((a, f) => (rank(f) > rank(a) ? f : a), undefined);
    return best ?? { ...DEFAULT_TICKET_FIELDS.find((f) => f.id === id)! };
  }).filter((f) => !f.hidden);
}
