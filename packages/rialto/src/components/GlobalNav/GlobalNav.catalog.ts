/**
 * Catalog metadata for the GlobalNav component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const globalNavCatalogMeta = {
  name: "GlobalNav",
  description:
    "Top bar that moves between the Mattbutler apps with a theme toggle. Use once at the top of a page. Set currentApp to the app being shown so its link is marked current.",
} satisfies CatalogMeta;
