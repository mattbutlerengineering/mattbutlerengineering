/**
 * Catalog metadata for the Hero component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const heroCatalogMeta = {
  name: "Hero",
  description:
    "Large opening section for a landing page, with a small eyebrow label, a big title, a subtitle and action buttons. Use once at the top of a marketing page. Keep title to one short line and subtitle to one or two sentences.",
  charLimits: {
    eyebrow: 40,
    subtitle: 200,
  },
} satisfies CatalogMeta;
