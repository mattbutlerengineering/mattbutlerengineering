/**
 * Catalog metadata for the Heading component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const headingCatalogMeta = {
  name: "Heading",
  description:
    "Section heading. Use level to set the document outline (1 for the page title, 2 for sections, 3 below that) and size when the look should differ from the level. Put its words in the children text.",
  slots: ["default"],
  charLimits: {
    children: 120,
  },
} satisfies CatalogMeta;
