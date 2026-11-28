export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="grid flex-1 place-items-center p-6">
      <span className="sr-only">Loading…</span>
      <div className="size-10 animate-spin rounded-full border-4 border-white/20 border-t-brand-light" />
    </div>
  );
}
