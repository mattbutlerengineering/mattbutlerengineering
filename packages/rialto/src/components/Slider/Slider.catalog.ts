/**
 * Catalog metadata for the Slider component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const sliderCatalogMeta = {
  name: "Slider",
  description:
    "Draggable single-value range control. Use to pick a number within a known range where precision matters less than feel, such as volume, brightness, or a budget. Provide a label, min, max, and defaultValue; set showValue to display the current number.",
  charLimits: {
    label: 40,
    disabledReason: 120,
  },
} satisfies CatalogMeta;
