import { type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { answerText, asQuestions, type TeamMember } from "@/lib/sessions";

// FES-12: session attendees (with answers) or competition teams (with members) as CSV
export async function GET(_req: NextRequest, { params }: { params: Promise<{ session: string }> }) {
  const { session: sessionId } = await params;
  const user = await getSession();
  if (!user || !/^[0-9a-f-]{36}$/i.test(sessionId)) return new Response("Not allowed", { status: 403 });
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_manage_session", { p_session_id: sessionId, p_user_id: user.id });
  if (!allowed) return new Response("Not allowed", { status: 403 });
  const { data: s } = await supabase.from("event_sessions").select("name, kind, questions").eq("id", sessionId).maybeSingle();
  if (!s) return new Response("Not found", { status: 404 });
  const questions = asQuestions(s.questions);
  const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "session";

  if (s.kind === "competition") {
    const { data: regs } = await supabase.rpc("session_registrations", { p_session_id: sessionId });
    const maxMembers = Math.max(1, ...(regs ?? []).map((r) => r.member_count));
    const rows = (regs ?? []).map((r) => {
      const members = (Array.isArray(r.members) ? r.members : []) as unknown as TeamMember[];
      const answers = (r.answers ?? {}) as Record<string, string>;
      return [
        r.team_name,
        r.status,
        r.order_status ?? "",
        r.order_ref ?? "",
        r.order_total_paisa !== null ? (Number(r.order_total_paisa) / 100).toFixed(2) : "",
        r.leader_name,
        r.leader_phone,
        r.leader_email,
        formatDateTime(r.created_at),
        `${r.checked_in}/${r.tickets}`,
        ...questions.map((q) => answerText(q, answers[q.id])),
        ...Array.from({ length: maxMembers }, (_, i) => {
          const m = members[i];
          return m ? [m.name, m.roll_no, m.university, m.phone, m.email].filter(Boolean).join(" | ") : "";
        }),
      ];
    });
    const csv = toCsv(
      ["Team", "Status", "Payment", "Order", "Paid (Rs)", "Lead", "Lead phone", "Lead email", "Registered (PKT)", "Checked in", ...questions.map((q) => q.label), ...Array.from({ length: maxMembers }, (_, i) => `Member ${i + 1}`)],
      rows,
    );
    return csvResponse(`${slug}-teams.csv`, csv);
  }

  const { data: attendees } = await supabase.rpc("session_attendees", { p_session_id: sessionId });
  const rows = (attendees ?? []).map((a) => {
    const ans = (a.answers ?? {}) as Record<string, string>;
    return [
      a.holder_name,
      a.holder_university ?? "",
      a.ticket_type,
      a.serial ?? a.code,
      a.buyer_name ?? "",
      a.buyer_phone ?? "",
      a.buyer_email ?? "",
      a.order_ref ?? "",
      ...questions.map((q) => answerText(q, ans[q.id])),
      a.session_checked_in_at ? formatDateTime(a.session_checked_in_at) : "",
    ];
  });
  const csv = toCsv(["Name", "University", "Ticket", "Code / serial", "Buyer", "Phone", "Email", "Order", ...questions.map((q) => q.label), "Checked in (PKT)"], rows);
  return csvResponse(`${slug}-attendees.csv`, csv);
}
