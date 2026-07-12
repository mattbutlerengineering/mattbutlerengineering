/**
 * Catalog metadata for the NavigationMenu component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const navigationMenuCatalogMeta = {
  name: "NavigationMenu",
  description:
    "Horizontal dropdown navigation bar for top-level site navigation. Use for the primary nav with 3-8 top-level items. Items with children render as dropdown menus on hover.",
  slots: ["default"],
  propSchemas: {
    items: 'z.array(z.object({ label: z.string(), href: z.string().optional(), children: z.array(z.object({ label: z.string(), href: z.string().optional() })).optional() }))',
  },
} satisfies CatalogMeta;
