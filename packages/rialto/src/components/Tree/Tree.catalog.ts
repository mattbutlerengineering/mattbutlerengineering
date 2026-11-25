/**
 * Catalog metadata for the Tree component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const treeCatalogMeta = {
  name: "Tree",
  description:
    "Expandable hierarchy for navigating nested data such as floor plans, menu categories or organisation units. Provide a data array of nodes with id and label, and optional nested children.",
  propSchemas: {
    data: "z.array(z.object({ id: z.string(), label: z.string(), disabled: z.boolean().optional(), children: z.array(z.any()).optional() }))",
  },
} satisfies CatalogMeta;
