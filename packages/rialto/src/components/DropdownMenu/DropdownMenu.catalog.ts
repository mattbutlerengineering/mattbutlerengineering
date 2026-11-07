/**
 * Catalog metadata for the DropdownMenu component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const dropdownMenuCatalogMeta = {
  name: "DropdownMenu",
  description:
    "Click-to-open menu of actions, such as a per-row overflow or an account menu. Set trigger to the trigger button label (e.g. 'Actions') and items to the entries: items have id and label (optional shortcut, disabled, destructive=true for dangerous actions like Delete); use type=divider to separate groups and type=label for a section heading. Use align=right when the trigger sits at the right edge.",
  propSchemas: {
    trigger: "z.string().max(40)",
    items:
      'z.array(z.object({ type: z.enum(["item", "divider", "label"]).optional(), id: z.string().optional(), label: z.string().max(40).optional(), shortcut: z.string().max(12).optional(), disabled: z.boolean().optional(), destructive: z.boolean().optional() }))',
  },
} satisfies CatalogMeta;
