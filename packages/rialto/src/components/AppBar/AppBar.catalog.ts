/**
 * Catalog metadata for the AppBar component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const appBarCatalogMeta = {
  name: "AppBar",
  description:
    "Sticky horizontal header bar for app navigation. Use glass=true (default) for backdrop blur surface. Use logo slot for brand identity and actions slot for navigation controls. Fixed height defaults to 56px.",
  charLimits: {
    height: 20,
  },
} satisfies CatalogMeta;
