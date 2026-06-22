/**
 * Catalog metadata for the Text component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const textCatalogMeta = {
  name: "Text",
  description:
    "Typography component for semantic text rendering. Use variant=display for page headings, variant=body (default) for paragraphs, variant=label for form labels, variant=caption for helper text, variant=detail for metadata.",
  slots: ["default"],
} satisfies CatalogMeta;
