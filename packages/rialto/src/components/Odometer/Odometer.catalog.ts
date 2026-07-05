/**
 * Catalog metadata for the Odometer component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const odometerCatalogMeta = {
  name: "Odometer",
  description:
    "Mechanical rolling-counter that animates a numeric value digit-by-digit by composing SplitFlap. Use for hero metrics, KPIs, and live counters that should feel physical as they update. Reads a real number and formats it with locale grouping (Intl.NumberFormat); pass formatOptions for currency, percentages, or fraction digits. Respects prefers-reduced-motion (snaps, no roll) and announces the whole value to screen readers. Pairs with Stat for dashboard tiles.",
  slots: [],
} satisfies CatalogMeta;
