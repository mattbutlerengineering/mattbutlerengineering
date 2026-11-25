/**
 * Catalog metadata for the ConfirmDialog component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const confirmDialogCatalogMeta = {
  name: "ConfirmDialog",
  description:
    "Confirmation dialog that asks the user to approve or cancel an action before it happens. Use for cancelling a booking, removing a guest or any step that is hard to undo. Give a short question as title, optional description, and set variant to destructive for irreversible actions.",
  charLimits: {
    title: 80,
    description: 200,
    confirmLabel: 24,
    cancelLabel: 24,
  },
} satisfies CatalogMeta;
