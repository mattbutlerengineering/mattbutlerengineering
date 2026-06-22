/**
 * Catalog metadata for the AspectRatio component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const aspectRatioCatalogMeta = {
  name: "AspectRatio",
  description:
    "Constrains children to a fixed width-to-height ratio. Use for images, videos, or media embeds to prevent layout shift. Common ratios: 16/9 (video), 4/3 (photo), 1 (square).",
  slots: ["default"],
} satisfies CatalogMeta;
