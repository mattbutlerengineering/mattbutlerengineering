/**
 * Catalog metadata for the Avatar component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const avatarCatalogMeta = {
  name: "Avatar",
  description:
    "Circular user avatar. Shows image if src provided, falls back to initials from name, then a generic icon. Use size=sm for compact lists, size=md (default) for most contexts, size=lg for profile headers. Use status to show online presence.",
  charLimits: {
    name: 30,
  },
} satisfies CatalogMeta;
