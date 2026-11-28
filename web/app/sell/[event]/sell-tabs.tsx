import Link from "next/link";
import { Megaphone, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";

/** D-043: a seller who is also an ambassador switches between scanning paper tickets and their link & rank. */
export function SellTabs({ eventId, active }: { eventId: string; active: "sell" | "promote" }) {
  const tab = (href: string, on: boolean, label: string, Icon: typeof ScanLine) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors",
        on ? "bg-brand text-navy" : "text-slate-300 hover:text-white",
      )}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </Link>
  );
  return (
    <nav aria-label="Seller sections" className="mx-auto mb-2 flex w-full max-w-lg gap-1 rounded-full bg-white/10 p-1 px-1">
      {tab(`/sell/${eventId}`, active === "sell", "Sell tickets", ScanLine)}
      {tab(`/sell/${eventId}/promote`, active === "promote", "My link & rank", Megaphone)}
    </nav>
  );
}
