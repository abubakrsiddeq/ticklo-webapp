import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

// NFR-07: privacy policy before launch. DRAFT – to be reviewed (see PROGRESS.md "Needs from Abubakar").
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="mb-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">Draft – this policy will be reviewed before launch.</p>
      <h1 className="mb-6 text-3xl font-bold text-navy">Privacy policy</h1>
      <div className="grid gap-4 leading-relaxed text-slate-700">
        <p>TickLO helps university societies in Pakistan sell event tickets. This page explains what we collect and why.</p>
        <h2 className="text-xl font-semibold text-navy">What we collect</h2>
        <ul className="list-disc pl-6">
          <li>Account details: name, email, phone number, university (optional) and profile photo (optional).</li>
          <li>Orders: tickets you book, payment reference code, transaction ID, sender name and the payment screenshot you upload.</li>
          <li>Student card photos, only when a ticket type requires one.</li>
          <li>Check-in records: when and by whom your ticket was scanned at the gate.</li>
        </ul>
        <h2 className="text-xl font-semibold text-navy">Who can see it</h2>
        <ul className="list-disc pl-6">
          <li>Your phone number and email are shown only to the organizers of events you have booked, and to TickLO admins.</li>
          <li>Payment screenshots and student card photos are private: only that event&apos;s organizers and TickLO admins can view them, through short-lived links.</li>
          <li>Gate volunteers see only your name and ticket type.</li>
        </ul>
        <h2 className="text-xl font-semibold text-navy">Payments</h2>
        <p>
          TickLO does not receive or hold your money. You pay the society directly. Refunds, if any, are handled by the society.
        </p>
        <h2 className="text-xl font-semibold text-navy">How long we keep data</h2>
        <p>Payment screenshots and student card photos are deleted a set period after the event (period to be announced).</p>
        <h2 className="text-xl font-semibold text-navy">Your choices</h2>
        <p>You can edit your profile at any time and ask us to delete your account from your profile page.</p>
      </div>
    </div>
  );
}
