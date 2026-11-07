/**
 * Catalog metadata for the PinInput component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const pinInputCatalogMeta = {
  name: "PinInput",
  description:
    "Row of single-character cells for a short one-time code, PIN, or verification code. Set length to the number of cells (default 4; use 6 for SMS codes), type=numeric (default) or alphanumeric, and mask=true for secrets. Always give a label and optionally a hint such as where the code was sent.",
  charLimits: {
    label: 40,
    hint: 120,
    disabledReason: 120,
  },
} satisfies CatalogMeta;
