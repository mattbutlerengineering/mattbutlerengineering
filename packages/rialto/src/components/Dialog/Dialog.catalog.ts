/**
 * Catalog metadata for the Dialog component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const dialogCatalogMeta = {
  name: "Dialog",
  description:
    "Modal dialog for focused interactions requiring user attention. Use for confirmations, forms, and detail views. Provide open state and onClose handler. Use title for the modal heading, description for subtitle text.",
  slots: ["default"],
  charLimits: {
    title: 60,
    description: 120,
  },
} satisfies CatalogMeta;
