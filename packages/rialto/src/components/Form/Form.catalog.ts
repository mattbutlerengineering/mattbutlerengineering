/**
 * Catalog metadata for the Form component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 *
 * include: false — Form composes FormField children and a function prop
 * (onValidSubmit); it isn't a flat-props leaf the JSON-driven AI generator
 * can emit. Kept cataloged (for schema/registry parity) but excluded from
 * the AI-facing catalog.
 */
import type { CatalogMeta } from "../catalog-meta";

export const formCatalogMeta = {
  name: "Form",
  include: false,
  description:
    "Wraps a set of FormField-wrapped controls. Validates on submit and blocks submission while any field is invalid.",
} satisfies CatalogMeta;
