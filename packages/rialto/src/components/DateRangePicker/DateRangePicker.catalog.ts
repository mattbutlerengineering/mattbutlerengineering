/**
 * Catalog metadata for the DateRangePicker component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const dateRangePickerCatalogMeta = {
  name: "DateRangePicker",
  description:
    "Calendar popover for choosing a start and end date. Use for stays, multi-night bookings, and report periods. Set min and max to bound selectable dates and label to name the field.",
  charLimits: {
    label: 40,
    placeholder: 60,
  },
} satisfies CatalogMeta;
