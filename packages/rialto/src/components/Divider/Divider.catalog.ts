/**
 * Catalog metadata for the Divider component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const dividerCatalogMeta = {
  name: "Divider",
  description:
    "Visual separator between content sections. Use orientation=horizontal (default) between vertical sections, orientation=vertical between horizontal items. Use label for short text like 'or' between form options.",
  charLimits: {
    label: 20,
  },
} satisfies CatalogMeta;
