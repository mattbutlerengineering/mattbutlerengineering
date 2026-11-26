/**
 * Catalog metadata for the Listbox component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const listboxCatalogMeta = {
  name: "Listbox",
  description:
    "Always-visible list for picking one option, or several with multiple=true. Use for short choices staff scan at a glance, such as a section, shift or table list. Give an aria-label and an options array of value and label.",
  propSchemas: {
    options:
      "z.array(z.object({ value: z.string(), label: z.string(), disabled: z.boolean().optional() }))",
  },
} satisfies CatalogMeta;
