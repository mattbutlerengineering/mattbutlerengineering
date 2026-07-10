/**
 * Catalog metadata for the FormField component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 *
 * include: false — FormField takes a single field element as `children` and
 * a `validate` function prop; neither is representable in the flat-props
 * JSON the AI generator emits. Kept cataloged (for schema/registry parity)
 * but excluded from the AI-facing catalog.
 */
import type { CatalogMeta } from "../catalog-meta";

export const formFieldCatalogMeta = {
  name: "FormField",
  include: false,
  description:
    "Wraps a single field control (Input, TextArea, NumberInput, Select, or Combobox) and connects it to the enclosing Form's validation state.",
} satisfies CatalogMeta;
