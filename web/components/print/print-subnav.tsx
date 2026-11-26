import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/** Batches | Sales & cash | Sell screen (printed tickets, D-041). */
export function PrintSubnav({ base, eventId, active }: { base: string; eventId: string; active: "batches" | "sales" }) {
  const item = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn("rounded-full px-3 py-1.5 text-sm transition-colors", on ? "bg-navy text-white" : "bg-white text-navy ring-1 ring-navy/10 hover:bg-muted")}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Printed tickets">
      {item(base, "Batches", active === "batches")}
      {item(`${base}/sales`, "Sales & cash", active === "sales")}
      <Link href={`/sell/${eventId}`} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-brand-strong hover:underline">
        Sell screen <ExternalLink className="size-3.5" aria-hidden />
      </Link>
    </nav>
  );
}
