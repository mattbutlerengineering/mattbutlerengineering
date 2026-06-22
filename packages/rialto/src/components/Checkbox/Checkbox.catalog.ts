/**
 * Catalog metadata for the Checkbox component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const checkboxCatalogMeta = {
  name: "Checkbox",
  description:
    "Checkbox for boolean selection. Use when users need to opt-in or out of something. Provide a label. Use description for additional context below the label. Use indeterminate for 'select all' with partial selection.",
  charLimits: {
    label: 30,
    description: 80,
  },
} satisfies CatalogMeta;
