/**
 * Catalog metadata for the Breadcrumb component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const breadcrumbCatalogMeta = {
  name: "Breadcrumb",
  description:
    "Navigation trail showing hierarchy position. Use on detail pages to help users navigate back. Provide an items array with label and href for each level; omit href on the last item (current page).",
} satisfies CatalogMeta;
