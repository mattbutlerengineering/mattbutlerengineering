/**
 * Catalog metadata for the DateRange component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema and AI description.
 *
 * `include: false` — DateRange is a controlled widget that requires an
 * `onChange` callback and a `{ start, end }` ISO-string value, so it cannot be
 * expressed as static AI-generated markup; it is kept in the metadata but
 * excluded from the catalog the AI consumes.
 */
import type { CatalogMeta } from "../catalog-meta";

export const dateRangeCatalogMeta = {
  name: "DateRange",
  include: false,
  description:
    "Inline, locale-aware month grid for date-range selection. Controlled via value ({ start, end } yyyy-mm-dd ISO strings, either endpoint nullable while picking) and onChange; the first activation sets the start, the second sets the end (endpoints auto-ordered, same-day allowed). Supports min/max bounds, an isDateDisabled predicate, locale, and weekStartsOn. Keyboard-navigable ARIA grid with an in-progress range preview.",
} satisfies CatalogMeta;
