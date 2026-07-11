/**
 * Catalog metadata for the DatePicker component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema and AI description.
 *
 * `include: false` — DatePicker is a controlled widget that requires an
 * `onChange` callback and cannot be expressed as static AI-generated markup, so
 * it is kept in the metadata but excluded from the catalog the AI consumes.
 */
import type { CatalogMeta } from "../catalog-meta";

export const datePickerCatalogMeta = {
  name: "DatePicker",
  include: false,
  description:
    "Date field: a read-only trigger input that opens a popover-hosted Calendar. Controlled via value (yyyy-mm-dd ISO string) and onChange; supports min/max bounds, an isDateDisabled predicate, locale, and weekStartsOn. Focus returns to the trigger on select or Escape.",
} satisfies CatalogMeta;
