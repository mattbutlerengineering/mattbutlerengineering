/**
 * Catalog metadata for the BarChart component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const barChartCatalogMeta = {
  name: "BarChart",
  description:
    "Vertical bar chart for a trend over time, such as revenue by month or signups by week. Use this instead of a paragraph or a Text element listing numbers. label is the accessible chart title (for example Revenue trend). data is an array of {label, value} points; value may be a number or a short formatted string such as $18.2k. Keep to about 12 points.",
  propSchemas: {
    data: "z.array(z.object({ label: z.string(), value: z.union([z.number(), z.string()]) })).min(1)",
  },
  charLimits: {
    label: 60,
  },
} satisfies CatalogMeta;
