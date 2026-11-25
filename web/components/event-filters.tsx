import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";

/** EVT-02: filter by university + search by name (plain GET form, works without JS). */
export function EventFilters({
  universities,
  q,
  uni,
  past,
}: {
  universities: { id: string; name: string; short_name: string | null }[];
  q?: string;
  uni?: string;
  past?: boolean;
}) {
  return (
    <form action="/events" method="get" className="grid gap-2 sm:grid-cols-[1fr_220px_auto]" role="search">
      {past ? <input type="hidden" name="tab" value="past" /> : null}
      <label className="relative">
        <span className="sr-only">Search events</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" defaultValue={q} placeholder="Search events…" className="pl-9" />
      </label>
      <label>
        <span className="sr-only">University</span>
        <NativeSelect name="uni" defaultValue={uni ?? ""}>
          <option value="">All universities</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.short_name ? `${u.short_name} – ${u.name}` : u.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <Button type="submit">Search</Button>
    </form>
  );
}
