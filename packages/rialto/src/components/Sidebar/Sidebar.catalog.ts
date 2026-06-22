/**
 * Catalog metadata for the Sidebar component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const sidebarCatalogMeta = {
  name: "Sidebar",
  description:
    "Vertical navigation panel for app-level navigation. Provide items (flat SidebarItem list or grouped SidebarSection array). Set collapsed=true for icon-only rail mode. Set active=true on the current page item.",
} satisfies CatalogMeta;
