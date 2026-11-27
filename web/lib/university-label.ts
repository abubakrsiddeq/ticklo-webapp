/**
 * "Name (City)" for lists, without repeating the city when the name already has it,
 * e.g. "Bahria University (Karachi)" stays as it is instead of "... (Karachi) (Karachi)".
 */
export function universityLabel(u: { name: string; city?: string | null }): string {
  const city = (u.city ?? "").trim();
  if (!city || u.name.toLowerCase().includes(city.toLowerCase())) return u.name;
  return `${u.name} (${city})`;
}

/** Approved universities whose name, short name or city match what was typed (for suggestions). */
export function matchUniversities<T extends { name: string; short_name?: string | null; city: string; status?: string }>(
  list: T[],
  query: string,
  limit = 5,
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return [];
  return list
    .filter((u) => u.status !== "pending")
    .filter((u) => {
      const hay = `${u.name} ${u.short_name ?? ""} ${u.city}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}
