/**
 * Catalog metadata for the StatusLED component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const statusLEDCatalogMeta = {
  name: "StatusLED",
  description:
    "A coloured status light with a label, such as a table's state. Use variant=success for free/available, variant=warning for needs attention (e.g. dirty), variant=danger for occupied or blocked, variant=accent for ready, variant=neutral or off otherwise. Always set label so the status is readable without colour.",
  charLimits: {
    label: 40,
  },
} satisfies CatalogMeta;
