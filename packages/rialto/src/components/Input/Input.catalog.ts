/**
 * Catalog metadata for the Input component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const inputCatalogMeta = {
  name: "Input",
  description:
    "Single-line text field. Always provide a label. Use hint for helper text below the field. Set error=true to show error styling. Use type attribute for email, password, number, etc.",
  charLimits: {
    label: 40,
    hint: 80,
  },
} satisfies CatalogMeta;
