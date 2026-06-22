/**
 * Catalog metadata for the DataList component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const dataListCatalogMeta = {
  name: "DataList",
  description:
    "Definition list of label-value pairs. Use for spec sheets, metadata panels, or structured key-value display. Use orientation=horizontal (default) for side-by-side pairs, orientation=vertical for stacked pairs. Use striped=true for alternating rows.",
} satisfies CatalogMeta;
