/**
 * derivePath — the one definition of a showcase page's route path.
 *
 * Plain .mjs (with a .d.mts sibling) so both the Vite app (page-registry.ts)
 * and Node scripts (scripts/ui-quality/routes.mjs, scripts/generate-sitemap.mjs)
 * can import it without a TypeScript toolchain.
 */

/**
 * Derives a page's route path from its id + category.
 * @param {{ id: string, category: string }} entry
 * @returns {string}
 */
export function derivePath(entry) {
  if (entry.category === "Examples") return `/examples/${entry.id.replace(/^example-/, "")}`;
  return `/components/${entry.id}`;
}
