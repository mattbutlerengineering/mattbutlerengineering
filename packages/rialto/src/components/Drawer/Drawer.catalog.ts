/**
 * Catalog metadata for the Drawer component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const drawerCatalogMeta = {
  name: "Drawer",
  description:
    "Slide-out panel anchored to an edge for secondary tasks such as advanced settings, filters, or record details, without leaving the page. Provide open state and onClose handler, a title, and body content as children. Use side=right (default), left or bottom; size=compact, default, wide or full. Put action Buttons at the end of the body. A Button labelled 'Open ...' placed before the Drawer opens it; a Button labelled 'Close' inside closes it.",
  slots: ["default"],
  charLimits: {
    title: 60,
    description: 120,
  },
} satisfies CatalogMeta;
