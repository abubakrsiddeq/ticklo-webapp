import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center px-4 py-16 text-center">
      <Logo className="mb-8" />
      <SearchX className="mb-4 size-14 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-bold text-navy">Page not found</h1>
      <p className="mt-2 text-muted-foreground">The link may be wrong, or the event is no longer available.</p>
      <Button asChild className="mt-6">
        <Link href="/events">Browse events</Link>
      </Button>
    </main>
  );
}
