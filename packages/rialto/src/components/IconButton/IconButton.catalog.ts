/**
 * Catalog metadata for the IconButton component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const iconButtonCatalogMeta = {
  name: "IconButton",
  description:
    "Icon-only action trigger for toolbars, dismiss affordances, and dense controls. Composes Button, so it shares the same variant (ghost default, secondary, primary) and size (sm/md/lg) options. Always provide aria-label — the button has no visible text, so the label is the only accessible name.",
} satisfies CatalogMeta;
