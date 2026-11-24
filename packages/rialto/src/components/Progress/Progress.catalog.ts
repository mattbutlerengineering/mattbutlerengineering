/**
 * Catalog metadata for the Progress component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const progressCatalogMeta = {
  name: "Progress",
  description:
    "Progress bar for a task or flow that has a known or unknown duration, such as a booking import or an upload. Give a value from 0 to 100 for determinate progress, or omit it for an indeterminate bar. Add a short label saying what is in progress.",
  charLimits: {
    label: 40,
  },
} satisfies CatalogMeta;
