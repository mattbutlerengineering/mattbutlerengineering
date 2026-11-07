/**
 * Catalog metadata for the Popover component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const popoverCatalogMeta = {
  name: "Popover",
  description:
    'Click-to-open floating panel anchored to a trigger button. Set trigger to the trigger button label (e.g. "Pick a time") and put the panel body as children — text, Inputs, or a short list of Buttons. Use for small contextual choices or details that should not take permanent space; use Dialog for anything that needs the user attention. title is an optional panel heading; placement is bottom (default), top, left or right.',
  slots: ["default"],
  propSchemas: {
    trigger: "z.string().max(40)",
  },
  charLimits: {
    title: 60,
  },
} satisfies CatalogMeta;
