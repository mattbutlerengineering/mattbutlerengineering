/**
 * Catalog metadata for the HoverCard component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const hoverCardCatalogMeta = {
  name: "HoverCard",
  description:
    "Rich preview card that opens when a trigger is hovered or focused. Use to show extra detail about a guest, table or reservation without leaving the page. Pass a short trigger element as children and the preview as content.",
} satisfies CatalogMeta;
