/**
 * Catalog metadata for the Steps component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const stepsCatalogMeta = {
  name: "Steps",
  description:
    "Step indicator for a multi-step flow such as booking, checkout or onboarding. Give the ordered steps, each with a short label and optional description, and currentStep as a zero-based index of the active step.",
  propSchemas: {
    steps: "z.array(z.object({ label: z.string(), description: z.string().optional() }))",
  },
} satisfies CatalogMeta;
