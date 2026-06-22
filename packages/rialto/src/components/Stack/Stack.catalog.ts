/**
 * Catalog metadata for the Stack component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const stackCatalogMeta = {
  name: "Stack",
  description:
    "Primary layout primitive. Use direction=column for vertical stacking, direction=row for horizontal. Compose with Card, Text, and form elements to build any layout. Use gap to control spacing between children.",
  slots: ["default"],
} satisfies CatalogMeta;
