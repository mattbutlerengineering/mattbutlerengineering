/**
 * Catalog metadata for the Select component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const selectCatalogMeta = {
  name: "Select",
  description:
    "Dropdown selection field. Always provide a label and options array. Use when users must pick one value from a known list. Prefer over radio buttons when there are more than 4 options.",
  charLimits: {
    label: 40,
  },
} satisfies CatalogMeta;
