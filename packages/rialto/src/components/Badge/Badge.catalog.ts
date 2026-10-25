/**
 * Catalog metadata for the Badge component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const badgeCatalogMeta = {
  name: "Badge",
  description:
    "Small status indicator label. Use variant=success for active/complete states, variant=warning for pending/attention states, variant=error for failed/blocked states, variant=neutral (default) for informational tags. Use dot=true to add a status circle. Put its words in label (required unless it holds child elements).",
  slots: ["default"],
  // As with Text: a string prop is the only way a spec can give a Badge words (F24).
  propSchemas: {
    children: "z.string()",
  },
  aliases: {
    label: "children",
  },
} satisfies CatalogMeta;
