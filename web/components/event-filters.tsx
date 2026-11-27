import { ArrowRight, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** EVT-02: filter by university + search by name (plain GET form, works without JS). */
export function EventFilters({
  universities,
  q,
  uni,
  past,
  className,
  action = "/events",
  placeholder = "Search events…",
  hidden,
}: {
  universities: { id: string; name: string; short_name: string | null }[];
  q?: string;
  uni?: string;
  past?: boolean;
  className?: string;
  /** Also used by the societies directory (D-046) */
  action?: string;
  placeholder?: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form
      action={action}
      method="get"
      role="search"
      className={cn(
        "flex flex-col gap-1 rounded-3xl bg-white p-1.5 shadow-pill ring-1 ring-navy/[0.06] sm:flex-row sm:items-center sm:rounded-full",
        className,
      )}
    >
      {past ? <input type="hidden" name="tab" value="past" /> : null}
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="relative flex-1">
        <span className="sr-only">{placeholder.replace("…", "")}</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="h-12 w-full rounded-full bg-transparent pr-4 pl-12 text-base text-navy outline-none placeholder:text-slate-400"
        />
      </label>
      <span className="hidden h-8 w-px bg-border sm:block" aria-hidden />
      <label className="relative sm:w-56">
        <span className="sr-only">University</span>
        <MapPin className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
        <select
          name="uni"
          defaultValue={uni ?? ""}
          className="h-12 w-full appearance-none truncate rounded-full bg-transparent pr-8 pl-12 text-base text-navy outline-none sm:text-sm"
        >
          <option value="">All universities</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.short_name ? `${u.short_name} – ${u.name}` : u.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="brand" size="lg" className="group h-12 rounded-full px-7 text-base">
        Search <ArrowRight className="transition group-hover:translate-x-0.5" aria-hidden />
      </Button>
    </form>
  );
}
