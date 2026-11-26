import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of use" };

// NFR-07: terms before launch. DRAFT – to be reviewed.
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="mb-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">Draft – these terms will be reviewed before launch.</p>
      <h1 className="mb-6 text-3xl font-bold text-navy">Terms of use</h1>
      <ol className="grid list-decimal gap-3 pl-6 leading-relaxed text-slate-700">
        <li>TickLO is a platform that connects students with university societies. Each event is organised by the society, not by TickLO.</li>
        <li>You pay the society directly. TickLO charges no fees and is not responsible for refunds; contact the society for any payment issue.</li>
        <li>Tickets are personal. Each ticket QR can be scanned only once – whoever is scanned first gets in, so never share your QR.</li>
        <li>Uploading fake or reused payment screenshots is fraud. Such accounts may be suspended and reported to the society.</li>
        <li>Societies must provide true information, honour the tickets they approve, and handle refunds for cancelled events.</li>
        <li>TickLO may suspend accounts or remove events that break these terms.</li>
      </ol>
    </div>
  );
}
