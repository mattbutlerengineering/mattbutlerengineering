/**
 * Catalog metadata for the Autocomplete component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const autocompleteCatalogMeta = {
  name: "Autocomplete",
  description:
    "Text field with a filterable suggestion list. Use when the guest or staff member picks from a long list of known options (guests, tables, venues) but may type to narrow it. Always give a label and options; set emptyText for the no-match state.",
  charLimits: {
    label: 40,
    hint: 120,
    emptyText: 60,
  },
  propSchemas: {
    options: "z.array(z.object({ value: z.string(), label: z.string() }))",
  },
} satisfies CatalogMeta;
