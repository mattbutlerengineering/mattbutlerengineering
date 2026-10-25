/**
 * Catalog metadata for the TimeSlots component. Read by the
 * @mbe/rialto-catalog generator to emit the Zod prop schema, AI description,
 * and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const timeSlotsCatalogMeta = {
  name: "TimeSlots",
  description:
    "Open times for one date and party size, as static labels under a date line. Required: date (display text for the day, such as Friday, Oct 30), partySize (a number) and times (an array of open times in time order, each the tool's localTime copied as is (HH:mm); the element writes them in the locale's clock). List open times only; a closed or fully booked day is said in words, not with this element. The element writes the party size in words itself.",
  // date is clamped at 40 chars, never dropped. times entries carry no .max():
  // the seam validates the array as one value (F13); the adapter drops blanks.
  charLimits: {
    date: 40,
  },
  propSchemas: {
    partySize: "z.union([z.number(), z.string()])",
    times: "z.array(z.string())",
  },
} satisfies CatalogMeta;
