/**
 * Catalog metadata for the Stat component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const statCatalogMeta = {
  name: "Stat",
  description:
    'A labelled headline number, such as covers tonight, open tables, or no-shows this week. value is the number (or short text like "7:30 PM"); label says what it counts. Add delta (e.g. "+6") with trend=up|down|neutral to show a change. Put several Stats in a Stack with direction=row for a summary row.',
  // value is a ReactNode, which the generator maps to an optional string; models
  // often send counts as numbers, so accept either (the adapter renders it as text).
  propSchemas: {
    value: "z.union([z.string(), z.number()])",
  },
  charLimits: {
    label: 25,
    delta: 10,
  },
} satisfies CatalogMeta;
