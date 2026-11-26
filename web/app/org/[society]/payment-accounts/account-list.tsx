"use client";

import { useState } from "react";
import { Landmark, Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { Pill } from "@/components/status-badge";
import { setPaymentAccountActive } from "@/app/org/_actions/manage";
import { AccountForm } from "./account-form";

export interface AccountRow {
  id: string;
  kind: "bank" | "jazzcash" | "easypaisa";
  label: string;
  bank_name: string | null;
  account_title: string;
  account_number: string;
  iban: string | null;
  is_active: boolean;
}

export function AccountList({ orgSlug, accounts }: { orgSlug: string; accounts: AccountRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!accounts.length) return <p className="text-sm text-muted-foreground">No accounts yet. Add your first one below.</p>;
  return (
    <ul className="grid gap-3">
      {accounts.map((a) =>
        editing === a.id ? (
          <li key={a.id} className="rounded-lg border bg-secondary/40 p-4">
            <AccountForm
              orgSlug={orgSlug}
              accountId={a.id}
              onDone={() => setEditing(null)}
              defaults={{ kind: a.kind, bank_name: a.bank_name ?? "", account_title: a.account_title, account_number: a.account_number, iban: a.iban ?? "" }}
            />
          </li>
        ) : (
          <li key={a.id} className={`flex flex-col gap-2 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:justify-between ${a.is_active ? "" : "opacity-60"}`}>
            <div className="flex gap-3">
              {a.kind === "bank" ? <Landmark className="mt-1 size-5 text-navy" aria-hidden /> : <Wallet className="mt-1 size-5 text-navy" aria-hidden />}
              <div>
                <p className="font-medium text-navy">
                  {a.label} {!a.is_active ? <Pill>Hidden</Pill> : null}
                </p>
                <p className="text-sm">{a.account_title}</p>
                <p className="font-mono text-sm text-muted-foreground">
                  {a.account_number}
                  {a.iban ? ` · ${a.iban}` : ""}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(a.id)}>
                <Pencil /> Edit
              </Button>
              <ActionButton variant="ghost" size="sm" action={setPaymentAccountActive.bind(null, orgSlug, a.id, !a.is_active)}>
                {a.is_active ? "Hide" : "Show"}
              </ActionButton>
            </div>
          </li>
        ),
      )}
    </ul>
  );
}
