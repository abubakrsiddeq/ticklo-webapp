import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Not allowed" };

export default function NotAllowedPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-1 flex-col items-center px-4 py-16 text-center">
        <ShieldX className="mb-4 size-14 text-destructive" aria-hidden />
        <h1 className="text-2xl font-bold text-navy">Not allowed</h1>
        <p className="mt-2 text-muted-foreground">You don&apos;t have access to this page. If you think you should, ask the society owner to add you to their team.</p>
        <Button asChild className="mt-6">
          <Link href="/">Go to home</Link>
        </Button>
      </main>
    </>
  );
}
