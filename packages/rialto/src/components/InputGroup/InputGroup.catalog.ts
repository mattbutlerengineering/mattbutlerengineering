/**
 * Catalog metadata for the InputGroup component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const inputGroupCatalogMeta = {
  name: "InputGroup",
  description:
    "Joins adjacent form controls into one visual row, for example a search Input beside a submit Button. Use only to pair related controls; place the controls as children.",
  slots: ["default"],
} satisfies CatalogMeta;
