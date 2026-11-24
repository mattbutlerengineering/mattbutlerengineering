/**
 * Catalog metadata for the SegmentedControl component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const segmentedControlCatalogMeta = {
  name: "SegmentedControl",
  description:
    "Pill-style switch between 2-4 mutually exclusive options, such as Day / Week / Month. Provide a segments array (id and label for each) and value set to the id selected at first. Prefer over Tabs when the choice changes a view setting rather than navigating sections.",
  propSchemas: {
    segments:
      "z.array(z.object({ id: z.string(), label: z.string(), disabled: z.boolean().optional() }))",
  },
} satisfies CatalogMeta;
