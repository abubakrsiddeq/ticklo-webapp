"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IdCard, Loader2, Search, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { deviceLabel } from "@/lib/scan/device";
import { formatTime } from "@/lib/format";

interface Row {
  ticket_id: string;
  code: string;
  holder_name: string;
  ticket_type: string;
  requires_student_card: boolean;
  status: "valid" | "checked_in" | "cancelled";
  checked_in_at: string | null;
  serial: string | null;
}

const cacheKey = (eventId: string) => `ticklo-attendees-${eventId}`;

/**
 * ORG-13 / SCN-09: find a student by name or ticket code and check them in by
 * hand (e.g. phone battery dead). The list is cached on this phone so it can
 * still be searched if the internet drops; checking in needs a connection.
 */
export function ManualList({
  eventId,
  open,
  onOpenChange,
  online,
  onCheckedIn,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  online: boolean;
  onCheckedIn: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await createClient().rpc("scanner_attendees", { p_event_id: eventId });
    setLoading(false);
    if (error || !data) {
      try {
        const cached = localStorage.getItem(cacheKey(eventId));
        if (cached) setRows(JSON.parse(cached) as Row[]);
      } catch {
        /* no cache */
      }
      if (error) toast.error("Could not load the list – showing the saved copy if available.");
      return;
    }
    setRows(data as Row[]);
    try {
      localStorage.setItem(cacheKey(eventId), JSON.stringify(data));
    } catch {
      /* storage full */
    }
  }, [eventId]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [open, load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows ?? [];
    if (!needle) return list.slice(0, 100);
    return list
      .filter(
        (r) =>
          r.holder_name.toLowerCase().includes(needle) ||
          r.code.toLowerCase().includes(needle) ||
          (r.serial ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 100);
  }, [rows, q]);

  async function checkIn(r: Row) {
    if (!window.confirm(`Check in ${r.holder_name} (${r.ticket_type})?${r.requires_student_card ? "\nCheck their student card first." : ""}`)) return;
    setBusy(r.ticket_id);
    const { data, error } = await createClient().rpc("manual_check_in", { p_ticket_id: r.ticket_id, p_device: `${deviceLabel()} (manual)` });
    setBusy(null);
    if (error) {
      toast.error("Could not check in – check your internet.");
      return;
    }
    const res = data as { result: string; checked_in_at?: string };
    if (res.result === "ok") {
      toast.success(`${r.holder_name} checked in`);
      setRows((all) => (all ?? []).map((x) => (x.ticket_id === r.ticket_id ? { ...x, status: "checked_in", checked_in_at: res.checked_in_at ?? new Date().toISOString() } : x)));
      onCheckedIn();
    } else if (res.result === "already_used") {
      toast.error(`Already used${res.checked_in_at ? ` at ${formatTime(res.checked_in_at)}` : ""}`);
      void load();
    } else {
      toast.error(res.result === "not_allowed" ? "You can't check in for this event." : "This ticket can't be checked in.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Manual check-in</SheetTitle>
          <SheetDescription>
            {online ? "Search by name, ticket code or the serial on a paper ticket." : "Offline: you can search the saved list, but check-in needs internet."}
          </SheetDescription>
          <label className="relative mt-2">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, code or paper serial (QWL-0042)" className="pl-9" autoFocus />
          </label>
        </SheetHeader>
        <div className="overflow-y-auto p-2">
          {loading && !rows ? (
            <div className="flex justify-center p-8">
              <Loader2 className="size-6 animate-spin" aria-label="Loading" />
            </div>
          ) : filtered.length ? (
            <ul className="divide-y">
              {filtered.map((r) => (
                <li key={r.ticket_id} className="flex items-center justify-between gap-3 px-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy">{r.holder_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.ticket_type} · <span className="font-mono">{r.serial ? `Printed ${r.serial}` : r.code}</span>
                    </p>
                    {r.requires_student_card ? (
                      <p className="flex items-center gap-1 text-xs text-warning">
                        <IdCard className="size-3.5" aria-hidden /> Student card
                      </p>
                    ) : null}
                  </div>
                  {r.status === "valid" ? (
                    <Button size="sm" variant="brand" disabled={!online || busy === r.ticket_id} onClick={() => checkIn(r)}>
                      {busy === r.ticket_id ? <Loader2 className="animate-spin" /> : <UserCheck />} Check in
                    </Button>
                  ) : (
                    <span className="shrink-0 text-sm text-muted-foreground">
                      Used{r.checked_in_at ? ` ${formatTime(r.checked_in_at)}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">{rows ? "No matching tickets." : "List not available."}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
