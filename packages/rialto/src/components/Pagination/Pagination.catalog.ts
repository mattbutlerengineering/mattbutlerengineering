/**
 * Catalog metadata for the Pagination component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const paginationCatalogMeta = {
  name: "Pagination",
  description:
    "Page navigation for long lists or tables, such as reservations or guests. Give page (starting at 1) and totalPages; use siblingCount to control how many neighbouring page numbers show.",
  charLimits: {
    ariaLabel: 60,
  },
} satisfies CatalogMeta;
