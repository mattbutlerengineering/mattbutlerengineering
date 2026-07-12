/**
 * Catalog metadata for the Combobox component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const comboboxCatalogMeta = {
  name: "Combobox",
  description:
    "Editable, filterable listbox for picking from many options. Always provide a label and options array. Use for single selection with type-ahead, or set multiple for tag-style multi-select with removable chips. Supports async/loading and empty states announced to screen readers. Prefer over Select when users benefit from typing to filter a long list.",
  charLimits: {
    label: 40,
  },
  propSchemas: {
    options: 'z.array(z.object({ value: z.string(), label: z.string(), disabled: z.boolean().optional() }))',
  },
} satisfies CatalogMeta;
