/**
 * Catalog metadata for the NumberInput component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const numberInputCatalogMeta = {
  name: "NumberInput",
  description:
    "Numeric field with stepper buttons. Use for counts and amounts such as party size, quantity, or price. Always give a label and a starting value; set min and max to bound it, and step (e.g. 0.5) to allow decimals.",
  charLimits: {
    label: 40,
    hint: 120,
    disabledReason: 120,
  },
} satisfies CatalogMeta;
