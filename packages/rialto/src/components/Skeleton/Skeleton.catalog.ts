/**
 * Catalog metadata for the Skeleton component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const skeletonCatalogMeta = {
  name: "Skeleton",
  description:
    'Pulsing placeholder shape shown while content loads. Use variant=text or heading with lines=3 for a paragraph, variant=circle for an avatar, variant=card or rect for images and cards. Set width and height as CSS values (e.g. "100%", "48px"). Put Skeletons where the real content will appear, not as decoration.',
  propSchemas: {
    width: "z.union([z.number(), z.string().max(20)]).optional()",
    height: "z.union([z.number(), z.string().max(20)]).optional()",
    gap: "z.union([z.number(), z.string().max(20)]).optional()",
  },
} satisfies CatalogMeta;
