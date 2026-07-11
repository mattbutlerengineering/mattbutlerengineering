/**
 * Catalog metadata for the Calendar component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema and AI description.
 *
 * `include: false` — Calendar is a controlled widget that requires an `onChange`
 * callback and cannot be expressed as static AI-generated markup, so it is kept
 * in the metadata but excluded from the catalog the AI consumes.
 */
import type { CatalogMeta } from "../catalog-meta";

export const calendarCatalogMeta = {
  name: "Calendar",
  include: false,
  description:
    "Inline, locale-aware month grid for single-date selection. Controlled via value (yyyy-mm-dd ISO string) and onChange; supports min/max bounds, an isDateDisabled predicate, locale, and weekStartsOn. Keyboard-navigable ARIA grid.",
} satisfies CatalogMeta;
