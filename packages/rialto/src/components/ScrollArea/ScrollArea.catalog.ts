/**
 * Catalog metadata for the ScrollArea component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const scrollAreaCatalogMeta = {
  name: "ScrollArea",
  description:
    "Fixed-height region whose content scrolls independently of the page. Set maxHeight (CSS value, e.g. '320px') and put the long content — a feed, list, or log — as children. Use when a long list must stay inside a panel or Card instead of lengthening the page.",
  slots: ["default"],
  propSchemas: {
    maxHeight: "z.union([z.number(), z.string().max(20)]).optional()",
  },
} satisfies CatalogMeta;
