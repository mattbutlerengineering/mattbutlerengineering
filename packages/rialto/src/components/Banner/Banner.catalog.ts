/**
 * Catalog metadata for the Banner component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const bannerCatalogMeta = {
  name: "Banner",
  description:
    "Full-width page-level message displayed at the top of a view. Use for one-per-page system announcements. Unlike Alert (inline), Banner spans the full width. Use variant=info (default) for announcements, variant=warning for important notices, variant=error for critical failures.",
  slots: ["default"],
  charLimits: {
    title: 60,
  },
} satisfies CatalogMeta;
