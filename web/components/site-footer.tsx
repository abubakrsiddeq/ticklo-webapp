import Link from "next/link";
import { TAGLINE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="no-print mt-auto border-t bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium text-navy">{TAGLINE}</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Footer">
          <Link href="/events" className="hover:text-foreground">Events</Link>
          <Link href="/org/new" className="hover:text-foreground">For societies</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
