/**
 * Catalog metadata for the Heading component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const headingCatalogMeta = {
  name: "Heading",
  description:
    "Section heading. Use level to set the document outline (1 for the page title, 2 for sections, 3 below that) and size when the look should differ from the level. Put its words in text (required unless it holds child elements).",
  slots: ["default"],
  // A generated spec has no other way to give Heading its words (as with Text, F24),
  // so children still needs a hand-declared schema. level/size are numeric-literal
  // unions (HeadingLevel is 1 | 2 | ... | 6) the generator now derives on its own.
  propSchemas: {
    children: "z.string()",
  },
  aliases: {
    text: "children",
  },
  charLimits: {
    children: 120,
  },
} satisfies CatalogMeta;
