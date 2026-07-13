/**
 * Catalog metadata for the Tabs component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const tabsCatalogMeta = {
  name: "Tabs",
  description:
    "Horizontal panel switcher for content organized into distinct sections. Use when users need to switch between 2-6 related views without leaving the page. Provide a tabs array with id, label, and content for each tab.",
  aliases: {
    items: "tabs",
    defaultValue: "defaultTab",
  },
  propSchemas: {
    tabs: "z.array(z.object({ id: z.string(), label: z.string(), disabled: z.boolean().optional(), content: z.string() }))",
  },
} satisfies CatalogMeta;
