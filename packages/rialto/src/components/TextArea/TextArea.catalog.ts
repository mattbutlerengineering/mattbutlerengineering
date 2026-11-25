/**
 * Catalog metadata for the TextArea component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const textAreaCatalogMeta = {
  name: "TextArea",
  description:
    "Multi-line text field. Use for free-form input such as special requests, allergies, notes, or messages. Always give a label; add a hint for guidance and set maxLength when input must be bounded.",
  charLimits: {
    label: 40,
    hint: 120,
    disabledReason: 120,
  },
} satisfies CatalogMeta;
