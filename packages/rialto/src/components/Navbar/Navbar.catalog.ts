/**
 * Catalog metadata for the Navbar component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const navbarCatalogMeta = {
  name: "Navbar",
  description:
    "Side navigation panel with a link list, optional search field, user block and footer. Use for the main menu of a staff app. Give each link a short label and an href; nest links as children for sub-sections.",
  charLimits: {
    label: 40,
  },
} satisfies CatalogMeta;
