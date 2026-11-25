/**
 * Catalog metadata for the ChatPanel component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const chatPanelCatalogMeta = {
  name: "ChatPanel",
  include: false,
  description:
    "Conversational panel that streams assistant replies and renders generated components inline. Use for an in-app assistant where staff ask questions or give commands in natural language.",
} satisfies CatalogMeta;
