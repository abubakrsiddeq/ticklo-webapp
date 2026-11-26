/**
 * PostgREST (Supabase) returns at most 1000 rows per request. Page through a
 * query until everything is loaded – printed batches can have 2000 tickets.
 */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 1000): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { data: all, error };
    all.push(...(data ?? []));
    if (!data || data.length < size) return { data: all, error: null };
  }
}
