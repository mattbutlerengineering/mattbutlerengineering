/**
 * Catalog metadata for the Table component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const tableCatalogMeta = {
  name: "Table",
  description:
    "Data table with sortable columns. Use for structured tabular data with 2+ columns. Provide columns array (key, header, sortable) and data array. Use density=compact for dense lists, density=spacious for readable tables. Use striped=true for alternating row backgrounds.",
  charLimits: {
    emptyMessage: 60,
  },
} satisfies CatalogMeta;
