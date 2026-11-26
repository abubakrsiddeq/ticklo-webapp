import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteUniversity } from "../actions";
import { UniversityForm, UniversityRow } from "./university-form";

export const metadata: Metadata = { title: "Universities" };

// ADM-07: name, city, email domain – add / edit
export default async function UniversitiesPage() {
  await requireAdmin("/admin/universities");
  const supabase = await createClient();
  const { data: unis } = await supabase.from("universities").select("id, name, short_name, city, email_domain").order("name");
  return (
    <div className="grid gap-6">
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
          <CardTitle>Universities ({unis?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(unis ?? []).map((u) => (
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
