import type { Enums } from "@/lib/database.types";

export type PaymentAccountKind = Enums<"payment_account_kind">;

export const ACCOUNT_KIND_LABEL: Record<PaymentAccountKind, string> = {
  bank: "Bank account",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
};

export function accountLabel(a: { kind: PaymentAccountKind; bank_name: string | null }): string {
  return a.kind === "bank" ? (a.bank_name ?? "Bank account") : ACCOUNT_KIND_LABEL[a.kind];
}
