import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteUniversity } from "../actions";
import { UniversityForm, UniversityRequestRow, UniversityRow } from "./university-form";

export const metadata: Metadata = { title: "Universities" };

function countBy(rows: { university_id: string | null }[] | null) {
  const m = new Map<string, number>();
  for (const r of rows ?? []) if (r.university_id) m.set(r.university_id, (m.get(r.university_id) ?? 0) + 1);
  return m;
}

// ADM-07: name, city, email domain – add / edit. D-057: review universities typed under "Other".
export default async function UniversitiesPage() {
  await requireAdmin("/admin/universities");
  const supabase = await createClient();
  const { data: all } = await supabase
    .from("universities")
    .select("id, name, short_name, city, email_domain, status, created_at, requester:profiles!universities_requested_by_fkey ( full_name, email )")
    .order("name");
  const unis = (all ?? []).filter((u) => u.status === "approved");
  const requests = (all ?? []).filter((u) => u.status === "pending").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ids = requests.map((r) => r.id);
  const [{ data: students }, { data: societies }] = ids.length
    ? await Promise.all([
        supabase.from("profiles").select("university_id").in("university_id", ids),
        supabase.from("organizations").select("university_id").in("university_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const studentCount = countBy(students);
  const societyCount = countBy(societies);
  const approvedChoices = unis.map((u) => ({ id: u.id, name: u.name, city: u.city }));

  return (
    <div className="grid gap-6">
      {requests.length ? (
        <Card className="ring-2 ring-brand/40">
          <CardHeader>
            <CardTitle>New university requests ({requests.length})</CardTitle>
            <CardDescription>
              Typed by students or societies under &ldquo;Other&rdquo;. Check that it is a real university, fix the spelling and approve – or merge it into one
              already in the list. Until then it is hidden from public pages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {requests.map((r) => {
                const linked = (studentCount.get(r.id) ?? 0) + (societyCount.get(r.id) ?? 0);
                return (
                  <li key={r.id} className="py-3">
                    <UniversityRequestRow
                      uni={r}
                      approved={approvedChoices}
                      info={{
                        requester: r.requester ? (r.requester.full_name || r.requester.email) : null,
                        students: studentCount.get(r.id) ?? 0,
                        societies: societyCount.get(r.id) ?? 0,
                        createdAt: r.created_at,
                      }}
                      rejectButton={
                        <ActionButton
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          action={deleteUniversity.bind(null, r.id)}
                          successMessage="Request rejected."
                          confirm={{
                            title: `Reject ${r.name}?`,
                            description: linked
                              ? `${linked} profile(s)/societies picked it. They keep working, without a university, and can choose again.`
                              : "It will be removed.",
                            confirmLabel: "Reject",
                          }}
                        >
                          Reject
                        </ActionButton>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Add a university</CardTitle>
        </CardHeader>
        <CardContent>
          <UniversityForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Universities ({unis.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {unis.map((u) => (
              <li key={u.id} className="py-3">
                <UniversityRow
                  uni={u}
                  deleteButton={
                    <ActionButton
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      action={deleteUniversity.bind(null, u.id)}
                      confirm={{ title: `Delete ${u.name}?`, description: "Profiles and societies linked to it keep working, without a university.", confirmLabel: "Delete" }}
                    >
                      Delete
                    </ActionButton>
                  }
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
