import { z } from "zod";
import { hasControlChars, requiredText } from "./common";

// ORG-02
export const paymentAccountSchema = z
  .object({
    kind: z.enum(["bank", "jazzcash", "easypaisa"]),
    bank_name: z.string().trim().max(80),
    account_title: requiredText("Account title", 2, 120),
    account_number: z
      .string()
      .trim()
      .min(4, "Enter the account or wallet number")
      .max(40, "Too long")
      .regex(/^[0-9A-Za-z\- ]+$/, "Use only letters, digits, spaces and dashes"),
    iban: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || /^PK\d{2}[A-Z]{4}[0-9A-Z]{16}$/.test(v.replace(/\s/g, "")), "Enter a valid Pakistani IBAN (PK…)"),
  })
  .refine((v) => v.kind !== "bank" || v.bank_name.length >= 2, { message: "Enter the bank name", path: ["bank_name"] });

export type PaymentAccountInput = z.infer<typeof paymentAccountSchema>;

// PAY-04: text fields of the payment proof (files are checked separately)
// (required-ness depends on the order total and is checked in the payment provider)
export const paymentProofSchema = z.object({
  transaction_id: z
    .string()
    .trim()
    .max(60, "Too long")
    .refine((v) => v === "" || /^[A-Za-z0-9][A-Za-z0-9 #/._-]*$/.test(v), "Use the letters and digits from your bank app"),
  sender_name: z
    .string()
    .trim()
    .max(100, "Too long")
    .refine((v) => v === "" || (/\p{L}/u.test(v) && !/[<>{}]/.test(v) && !hasControlChars(v)), "Enter the account holder's name"),
  payment_account_id: z.union([z.literal(""), z.string().uuid("Choose one of the accounts shown")]),
});

export const rejectSchema = z.object({
  reason: requiredText("Reason", 3, 500),
});

export const disputeSchema = z.object({
  message: requiredText("Message", 10, 2000),
});
