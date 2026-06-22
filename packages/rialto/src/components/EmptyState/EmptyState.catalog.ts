/**
 * Catalog metadata for the EmptyState component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const emptyStateCatalogMeta = {
  name: "EmptyState",
  description:
    "Centered placeholder for empty lists, tables, or content areas. Show when a collection has no items. Use heading for the main message, description to explain what to do next. Optionally add an action button.",
  slots: ["default"],
  charLimits: {
    heading: 50,
    description: 300,
  },
  aliases: {
    title: "heading",
  },
} satisfies CatalogMeta;
