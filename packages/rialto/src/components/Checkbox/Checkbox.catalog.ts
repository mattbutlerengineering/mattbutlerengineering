/**
 * Catalog metadata for the Checkbox component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const checkboxCatalogMeta = {
  name: "Checkbox",
  description:
    "Checkbox for boolean selection. Use when users need to opt-in or out of something. Provide a label of at most 80 characters (a full sentence such as a terms agreement fits). Use description for additional context below the label. Use indeterminate for 'select all' with partial selection. For single choice use RadioGroup (exported alongside): pass `options` (value, label, optional description/disabled/disabledReason), `orientation` (vertical or horizontal), `description`, `error` and `required`.",
  charLimits: {
    label: 80,
    description: 80,
  },
} satisfies CatalogMeta;
