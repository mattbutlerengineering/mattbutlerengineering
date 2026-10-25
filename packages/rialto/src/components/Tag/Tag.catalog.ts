/**
 * Catalog metadata for the Tag component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const tagCatalogMeta = {
  name: "Tag",
  description:
    "A short descriptive label, such as a guest tag (VIP, Regular), a dietary restriction (Gluten-free), an occasion (Birthday), or a seating preference. Its words go in children. Use Badge for status instead. variant=accent highlights, variant=success/error for positive or warning labels, default otherwise.",
  charLimits: {
    children: 30,
  },
  aliases: {
    label: "children",
  },
} satisfies CatalogMeta;
