import { cn } from "@/lib/utils";
import { SiteHeaderShell } from "@/components/site-header";

// Shown by loading.tsx files the moment a link is clicked, while the server
// renders the real page (D-038). Shapes roughly match the pages.

function Bar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-navy/[0.07]", className)} />;
}

function Card({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("rounded-2xl bg-white p-5 shadow-card ring-1 ring-navy/[0.06]", className)}>{children}</div>;
}

export type SkeletonVariant = "list" | "grid" | "detail";

/** The page body only (layouts around it stay on screen). */
export function PageSkeleton({ variant = "list", className }: { variant?: SkeletonVariant; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("grid gap-4", className)}>
      <span className="sr-only">Loading…</span>
      {variant === "grid" ? (
        <>
          <Bar className="h-9 w-56" />
          <Bar className="h-11 w-full max-w-xl" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Card key={i} className="grid gap-3 p-0">
                <Bar className="aspect-[16/10] w-full rounded-b-none rounded-t-2xl" />
                <div className="grid gap-2 px-5 pb-5">
                  <Bar className="h-5 w-3/4" />
                  <Bar className="h-4 w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : variant === "detail" ? (
        <>
          <Bar className="aspect-[21/9] w-full rounded-3xl" />
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card className="grid gap-3">
              <Bar className="h-8 w-2/3" />
              <Bar className="h-4 w-1/2" />
              <Bar className="h-4 w-full" />
              <Bar className="h-4 w-5/6" />
            </Card>
            <Card className="grid gap-3">
              <Bar className="h-6 w-1/2" />
              <Bar className="h-12 w-full" />
              <Bar className="h-12 w-full" />
            </Card>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Card key={i} className="grid gap-2">
                <Bar className="h-4 w-1/2" />
                <Bar className="h-7 w-1/3" />
              </Card>
            ))}
          </div>
          <Card className="grid gap-4">
            <Bar className="h-6 w-48" />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Bar className="size-10 shrink-0 rounded-full" />
                <div className="grid flex-1 gap-2">
                  <Bar className="h-4 w-2/5" />
                  <Bar className="h-3 w-1/4" />
                </div>
                <Bar className="h-8 w-20" />
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

/** Whole screen (header + body) for top-level loading.tsx, where no layout is on screen yet. */
export function FullPageSkeleton({ variant = "list" }: { variant?: SkeletonVariant }) {
  return (
    <>
      <SiteHeaderShell />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">
        <PageSkeleton variant={variant} />
      </main>
    </>
  );
}
