/**
 * Generate a URL-safe slug from a venue name.
 * Lowercase, replace spaces/special chars with hyphens, collapse multiples, trim edges.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
