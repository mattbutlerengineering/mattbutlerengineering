/**
 * Catalog metadata for the CommandPalette component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const commandPaletteCatalogMeta = {
  name: "CommandPalette",
  description:
    "Searchable command palette for jumping to pages or running actions by typing. Use for staff shortcuts across a busy service. Give items each with an id and short label, optionally grouped, and a placeholder.",
  charLimits: {
    placeholder: 60,
  },
} satisfies CatalogMeta;
