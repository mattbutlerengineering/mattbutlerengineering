/**
 * Catalog metadata for the Text component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const textCatalogMeta = {
  name: "Text",
  description:
    "Typography component for semantic text rendering. Use variant=display for page headings, variant=body (default) for paragraphs, variant=label for form labels, variant=caption for helper text, variant=detail for metadata. Put the words in text.",
  slots: ["default"],
  // A generated spec has no other way to give Text its words: the default slot
  // holds child elements, not a string (F24).
  propSchemas: {
    children: "z.string().optional()",
  },
  aliases: {
    text: "children",
  },
} satisfies CatalogMeta;
