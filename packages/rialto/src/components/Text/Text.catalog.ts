/**
 * Catalog metadata for the Text component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const textCatalogMeta = {
  name: "Text",
  description:
    "Typography component for semantic text rendering. Use variant=display for page headings, variant=body (default) for paragraphs, variant=label for form labels, variant=caption for helper text, variant=detail for metadata. Put its words in text (required unless it holds child elements).",
  slots: ["default"],
  // A generated spec has no other way to give Text its words: the default slot
  // holds child elements, not a string (F24). Required, because live the model
  // filled Tag's required words every time and skipped optional ones here.
  propSchemas: {
    children: "z.string()",
  },
  aliases: {
    text: "children",
  },
} satisfies CatalogMeta;
