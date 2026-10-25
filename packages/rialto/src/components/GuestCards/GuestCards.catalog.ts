/**
 * Catalog metadata for the GuestCards component. Read by the
 * @mbe/rialto-catalog generator to emit the Zod prop schema, AI description,
 * and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const guestCardsCatalogMeta = {
  name: "GuestCards",
  description:
    "One card per matching guest, stacked: name, visit count, risk and tags. Required: guests, an array of cards, at most five. Each card needs name, visits (a number) and risk (the raw value from the tool, such as trusted, copied as is); tags is the guest's tags, optional. The element writes the visit count and risk in words itself. Never put email, phone, notes or spend on a card. A card missing name, visits or risk is left out.",
  // Card fields are optional and untyped beyond string/number, with no .max():
  // the seam validates the array as one value, so a strict nested rule would
  // drop every card over one (F13). The adapter drops incomplete cards.
  propSchemas: {
    guests:
      "z.array(z.object({ name: z.string().optional(), visits: z.union([z.number(), z.string()]).optional(), risk: z.string().optional(), tags: z.array(z.string()).optional() }))",
  },
} satisfies CatalogMeta;
