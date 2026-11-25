"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-navy">Something went wrong</h1>
      <p className="mt-2 text-muted-foreground">Please try again. If it keeps happening, check your internet connection.</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p> : null}
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
