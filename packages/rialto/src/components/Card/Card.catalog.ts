/**
 * Catalog metadata for the Card component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const cardCatalogMeta = {
  name: "Card",
  description:
    "Content container. Use for grouping related information with a title. Compose inside Stack to build layouts. Use variant=elevated (default) for most cards, variant=flat for dense lists, variant=glass for overlaid content.",
  slots: ["default"],
  charLimits: {
    title: 60,
    subtitle: 80,
  },
} satisfies CatalogMeta;
