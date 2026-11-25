export function slugify(input: string, maxLength = 60): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : `${slug || "x"}-${Math.random().toString(36).slice(2, 6)}`;
}

export function withSuffix(slug: string, maxLength = 60): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug.slice(0, maxLength - 5).replace(/-+$/g, "")}-${suffix}`;
}
