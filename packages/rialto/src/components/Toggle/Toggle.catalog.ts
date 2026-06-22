/**
 * Catalog metadata for the Toggle component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const toggleCatalogMeta = {
  name: "Toggle",
  description:
    "Binary on/off switch. Use for settings and preferences that take effect immediately without a submit button. Always provide a label describing what is being toggled.",
  charLimits: {
    label: 30,
  },
} satisfies CatalogMeta;
