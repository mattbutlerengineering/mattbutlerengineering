/**
 * Catalog metadata for the Meter component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const meterCatalogMeta = {
  name: "Meter",
  description:
    "Gauge showing a measured value within a known range, such as table occupancy or deposit goal. Unlike Progress it is not a task. Give value, min and max, a short label, and a variant (success, error) to signal good or bad.",
  charLimits: {
    label: 25,
  },
} satisfies CatalogMeta;
