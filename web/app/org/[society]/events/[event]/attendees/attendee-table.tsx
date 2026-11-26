"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatPhone } from "@/lib/phone";
import { manualCheckIn } from "@/app/org/_actions/manage";

export interface AttendeeRow {
  id: string;
  code: string;
  name: string;
  type: string;
  card: boolean;
  orderRef: string;
  orderTime: string;
  phone: string | null;
  email: string | null;
  status: string;
  checkedInAt: string | null;
  checkedInBy: string | null;
  method: string | null;
}

function CheckInButton({ orgSlug, row }: { orgSlug: string; row: AttendeeRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="brand"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Check in ${row.name} (${row.type})?${row.card ? "\nCheck their student card." : ""}`)) return;
        start(async () => {
          const res = await manualCheckIn(orgSlug, row.id);
          if (res.ok) toast.success(`${row.name} checked in`);
          else toast.error(res.error);
          router.refresh();
        });
      }}
    >
      <UserCheck /> {pending ? "…" : "Check in"}
    </Button>
  );
}

// ORG-09 search + ORG-13 manual check-in
export function AttendeeTable({ orgSlug, rows, canCheckIn }: { orgSlug: string; rows: AttendeeRow[]; canCheckIn: boolean }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.name, r.code, r.orderRef, r.phone ?? "", r.email ?? "", r.type].some((v) => v.toLowerCase().includes(needle)),
    );
  }, [q, rows]);

  return (
    <div className="grid gap-3">
      <label className="relative">
        <span className="sr-only">Search attendees</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, ticket code or order…" className="pl-9" />
      </label>
      <p className="text-sm text-muted-foreground">
        {filtered.length} of {rows.length} tickets · {rows.filter((r) => r.status === "checked_in").length} checked in
      </p>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-secondary/60 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Ticket</th>
              <th className="px-3 py-2 font-medium">Order</th>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-3 py-2 font-medium">Check-in</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2">
                  <div className="font-medium text-navy">{r.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.code}</div>
                </td>
                <td className="px-3 py-2">
                  {r.type}
                  {r.card ? <div className="text-xs text-warning">Student card</div> : null}
                </td>
                <td className="px-3 py-2">
                  <div className="font-mono">{r.orderRef}</div>
                  <div className="text-xs text-muted-foreground">{r.orderTime}</div>
                </td>
                <td className="px-3 py-2">
                  <div>{formatPhone(r.phone)}</div>
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </td>
                <td className="px-3 py-2">
                  {r.status === "valid" ? (
                    canCheckIn ? <CheckInButton orgSlug={orgSlug} row={r} /> : <StatusBadge status="valid" label="Not arrived" />
                  ) : (
                    <div>
                      <StatusBadge status={r.status} />
                      {r.checkedInAt ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {r.checkedInAt}
                          {r.checkedInBy ? ` · by ${r.checkedInBy}` : ""}
                          {r.method === "manual" ? " (manual)" : ""}
                        </div>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
