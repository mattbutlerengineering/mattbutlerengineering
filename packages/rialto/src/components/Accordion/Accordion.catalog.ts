/**
 * Catalog metadata for the Accordion component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const accordionCatalogMeta = {
  name: "Accordion",
  description:
    "Grouped set of collapsible panels. Use for FAQs, settings groups, or any content that benefits from progressive disclosure. Provide items array with id, title, and content. Set multiple=true to allow several panels open at once.",
  slots: ["default"],
  propSchemas: {
    items:
      "z.array(z.object({ id: z.string(), title: z.string(), content: z.string(), disabled: z.boolean().optional() }))",
  },
} satisfies CatalogMeta;
