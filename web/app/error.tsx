"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-navy">Something went wrong</h1>
      <p className="mt-2 text-muted-foreground">Please try again. If it keeps happening, refresh the page or start again from the home page.</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Go to home</Link>
        </Button>
      </div>
    </main>
  );
}
