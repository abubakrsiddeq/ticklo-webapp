/**
 * Current time for Server Components. They render once per request, so
 * reading the clock during render is intended there (not in Client Components).
 */
export function serverNow(): number {
  return Date.now();
}
