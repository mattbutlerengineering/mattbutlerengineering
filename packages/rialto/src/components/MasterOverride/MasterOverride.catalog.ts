/**
 * Catalog metadata for the MasterOverride component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const masterOverrideCatalogMeta = {
  name: "MasterOverride",
  description:
    "Guarded master switch with a lift-to-arm safety cover. Use for high-stakes venue-wide toggles such as pausing all online bookings or closing the kitchen. Always give a label; the optional description explains the consequence, and variant danger signals the highest severity.",
  charLimits: {
    label: 40,
    idleLabel: 20,
    activeLabel: 20,
    coverLabel: 30,
  },
} satisfies CatalogMeta;
