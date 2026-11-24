/**
 * Catalog metadata for the ContextMenu component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const contextMenuCatalogMeta = {
  name: "ContextMenu",
  description:
    "Right-click menu of actions attached to an element, such as a reservation or table. Use for secondary actions like edit, move or cancel. Give items with short labels; mark risky ones destructive.",
  propSchemas: {
    items:
      'z.array(z.object({ type: z.enum(["item", "divider", "label"]).optional(), id: z.string().optional(), label: z.string().max(40).optional(), shortcut: z.string().max(12).optional(), disabled: z.boolean().optional(), destructive: z.boolean().optional() }))',
  },
} satisfies CatalogMeta;
