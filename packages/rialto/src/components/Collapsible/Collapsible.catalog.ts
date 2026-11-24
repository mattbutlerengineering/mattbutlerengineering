/**
 * Catalog metadata for the Collapsible component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const collapsibleCatalogMeta = {
  name: "Collapsible",
  description:
    "Single show/hide section with a heading trigger. Use to tuck away secondary detail such as policies, notes, or advanced options so the main content stays scannable. Put the section content in the children slot.",
  slots: ["default"],
  charLimits: {
    trigger: 60,
  },
} satisfies CatalogMeta;
