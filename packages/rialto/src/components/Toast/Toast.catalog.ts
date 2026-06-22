/**
 * Catalog metadata for the Toast component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const toastCatalogMeta = {
  name: "Toast",
  description:
    "Transient notification shown via useToast() hook. Use variant=success for completed actions, variant=error for failures, variant=accent for highlights. Always provide a title. Add description for additional context. Auto-dismisses after 4s by default.",
  charLimits: {
    title: 50,
    description: 120,
  },
} satisfies CatalogMeta;
