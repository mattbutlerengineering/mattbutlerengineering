/**
 * Catalog metadata for the DepartureBoard component. Read by the
 * @mbe/rialto-catalog generator to emit the Zod prop schema, AI description,
 * and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const departureBoardCatalogMeta = {
  name: "DepartureBoard",
  description:
    "Split-flap departure board hero that cycles through a sequence of short headlines or value-props with a mechanical flap animation. Use as a marketing or landing-page hero. Provide phrases as the ordered list of lines; tune holdMs for how long each line stays before flipping. Respects reduced motion by showing static text.",
} satisfies CatalogMeta;
