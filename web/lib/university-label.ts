/** "islamabad" -> "Islamabad"; a city typed with its own capitals is kept as typed. */
function cityCase(city: string): string {
  return city === city.toLowerCase() ? city.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : city;
}

/**
 * Always "Name (City)" for lists. A city already at the end of the name is taken off first, so
 * "Bahria University Islamabad", "Bahria University (Islamabad)" and "Bahria University, Islamabad"
 * all show as "Bahria University (Islamabad)". A city that is part of the real name, as in
 * "University of Karachi" or "Lahore University of Management Sciences", is left alone, with no
 * city added after it.
 */
export function universityLabel(u: { name: string; city?: string | null }): string {
  const name = u.name.trim().replace(/\s+/g, " ");
  const city = (u.city ?? "").trim().replace(/\s+/g, " ");
  if (!city) return name;
  const esc = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const base = name.replace(new RegExp(`[\\s,\\-–]*\\(?\\s*(?<!\\p{L})${esc}\\s*\\)?\\s*$`, "iu"), "").trim();
  // "University of Karachi": the city finishes the real name, so it stays.
  const stripped = base !== name && base.length > 0 && !/\b(of|the|at|in|for|and|&)$/i.test(base);
  if (!stripped && new RegExp(`(^|[^\\p{L}])${esc}([^\\p{L}]|$)`, "iu").test(name)) return name;
  return `${stripped ? base : name} (${cityCase(city)})`;
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
