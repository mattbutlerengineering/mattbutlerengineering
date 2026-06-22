/**
 * Catalog metadata for the Alert component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const alertCatalogMeta = {
  name: "Alert",
  description:
    "Inline feedback message embedded in the page flow. Use variant=info (default) for guidance, variant=success for confirmations, variant=warning for time-sensitive messages, variant=error for failures. Set dismissible=true to allow users to close it.",
  slots: ["default"],
  charLimits: {
    title: 60,
  },
} satisfies CatalogMeta;
