/**
 * Catalog metadata for the Tooltip component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const tooltipCatalogMeta = {
  name: "Tooltip",
  description:
    "Short hover/focus hint attached to one trigger element. Put the element being explained (a Button, IconButton, Badge, or Text) as the single child and the hint in content (one short sentence). Use for brief explanations of terms or icon-only controls; never for essential information, long text, or interactive content. placement is top (default), bottom, left or right.",
  slots: ["default"],
  charLimits: {
    content: 120,
  },
} satisfies CatalogMeta;
