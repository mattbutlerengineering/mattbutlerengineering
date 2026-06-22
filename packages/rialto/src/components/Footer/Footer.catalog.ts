/**
 * Catalog metadata for the Footer component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const footerCatalogMeta = {
  name: "Footer",
  description:
    "Page footer. Use variant=minimal (default) for a slim utility bar with children content. Use variant=rich for a multi-column footer with logo, link groups, and copyright text.",
  slots: ["default"],
  charLimits: {
    copyright: 80,
  },
} satisfies CatalogMeta;
