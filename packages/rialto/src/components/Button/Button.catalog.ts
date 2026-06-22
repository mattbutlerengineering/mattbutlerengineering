/**
 * Catalog metadata for the Button component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const buttonCatalogMeta = {
  name: "Button",
  description:
    "Clickable action trigger. Use variant=primary for the main CTA; variant=secondary for supporting actions; variant=ghost for tertiary or inline actions. Use size=sm for compact UIs, size=md (default) for most contexts, size=lg for prominent calls-to-action.",
  slots: ["default"],
  charLimits: {
    children: 30,
  },
  aliases: {
    label: "children",
  },
} satisfies CatalogMeta;
