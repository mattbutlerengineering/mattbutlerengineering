/**
 * Catalog metadata for the TagsInput component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const tagsInputCatalogMeta = {
  name: "TagsInput",
  description:
    "Free-text tags entry where typing a value and pressing Enter or comma adds a removable chip. Use for open-ended notes such as guest dietary needs or venue tags. Give a label, and optionally maxTags and defaultValue.",
  propSchemas: {
    defaultValue: "z.array(z.string()).optional()",
  },
  charLimits: {
    label: 40,
    placeholder: 60,
    hint: 120,
  },
} satisfies CatalogMeta;
