/**
 * Catalog metadata for the TimePicker component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema and AI description.
 *
 * `include: false` — TimePicker is a controlled widget that requires an
 * `onChange` callback and cannot be expressed as static AI-generated markup, so
 * it is kept in the metadata but excluded from the catalog the AI consumes.
 */
import type { CatalogMeta } from "../catalog-meta";

export const timePickerCatalogMeta = {
  name: "TimePicker",
  include: false,
  description:
    "Time field: a read-only trigger input that opens a popover-hosted listbox of interval slots. Controlled via value (24h HH:mm string) and onChange; supports a configurable step (default 15 min), min/max bounds, an isTimeDisabled predicate (authoritative over bounds), and locale-aware display. Focus returns to the trigger on select or Escape.",
} satisfies CatalogMeta;
