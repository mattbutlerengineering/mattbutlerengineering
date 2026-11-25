import type { CatalogMeta } from "../catalog-meta";

export const splitScreenExitCatalogMeta = {
  name: "SplitScreenExit",
  description:
    "Closing transition that splits the screen in two and reveals what is behind it. Set active=true when a finished flow, such as a confirmed booking, should exit. Give announcement a short sentence for screen readers.",
  slots: ["default"],
  charLimits: {
    announcement: 120,
  },
} satisfies CatalogMeta;
