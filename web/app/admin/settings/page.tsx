import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateTime } from "@/lib/format";
import { SiteSettingsForm } from "../control-buttons";

export const metadata: Metadata = { title: "Settings" };

// D-084: site-wide settings (announcement banner) and a map of what admins can do
export default async function AdminSettingsPage() {
  await requireAdmin("/admin/settings");
  const supabase = await createClient();
  const { data: s } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
  const { data: by } = s?.updated_by ? await supabase.from("profiles").select("full_name, email").eq("id", s.updated_by).maybeSingle() : { data: null };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Announcement banner</CardTitle>
          <CardDescription>
            A short message at the top of every page, for everyone (logged in or not).
            {s?.updated_by ? ` Last changed by ${by?.full_name ?? by?.email ?? "an admin"} on ${formatShortDateTime(s.updated_at)}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SiteSettingsForm
            initial={{
              announcement: s?.announcement ?? "",
              tone: s?.announcement_tone === "warning" ? "warning" : "info",
              active: Boolean(s?.announcement_active),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What admins can do</CardTitle>
          <CardDescription>Every change is saved in the audit log with your name.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm">
            <li>
              <Link href="/admin/societies" className="font-medium text-brand-strong underline">
                Societies
              </Link>
              : edit name, link and university, suspend or lift a suspension, delete or bring back, turn off payment accounts, and open any society&apos;s dashboard as its owner.
            </li>
            <li>
              <Link href="/admin/events" className="font-medium text-brand-strong underline">
                Events
              </Link>
              : pause or resume ticket sales, unpublish or delete events nobody booked, cancel events. Edit anything else from the society&apos;s dashboard.
            </li>
            <li>
              <Link href="/admin/orders" className="font-medium text-brand-strong underline">
                Orders
              </Link>
              : approve or reject payments, send tickets again, fix buyer details, cancel one ticket, mark an order refunded.
            </li>
            <li>
              <Link href="/admin/users" className="font-medium text-brand-strong underline">
                Users
              </Link>
              : edit profile and login email, send a password reset link, sign out of every device, suspend, make admin, change society roles, delete the account.
            </li>
            <li>
              <Link href="/admin/logs?tab=emails&failed=1" className="font-medium text-brand-strong underline">
                Emails
              </Link>
              : send failed ticket and payment emails again.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
