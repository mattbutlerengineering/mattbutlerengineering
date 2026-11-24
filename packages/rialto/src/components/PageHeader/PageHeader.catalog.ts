/**
 * Catalog metadata for the PageHeader component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const pageHeaderCatalogMeta = {
  name: "PageHeader",
  description:
    "Page masthead with a title, optional breadcrumb trail, badges beside the title and action buttons. Use once at the top of a page. Keep title short and put the main actions in actions.",
  charLimits: {
    title: 80,
    breadcrumbLabel: 40,
  },
} satisfies CatalogMeta;
