/**
 * Catalog metadata for the RadialGauge component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const radialGaugeCatalogMeta = {
  name: "RadialGauge",
  description:
    "Analog instrument dial for a bounded metric (utilization, score, capacity) — the dial counterpart to Meter. A gold accent arc fills over an aluminium track with an optional pointer needle. Provide value plus min/max (defaults 0-100). Set unit to append a suffix like % to the readout. Set needle=false to hide the pointer, showValue=false to hide the centre number. Use size=sm for compact panels, size=md (default), size=lg for a hero reading.",
  charLimits: {
    label: 40,
    unit: 8,
  },
} satisfies CatalogMeta;
