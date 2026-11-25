import type { CatalogMeta } from "../catalog-meta";

export const errorBoundaryCatalogMeta = {
  name: "ErrorBoundary",
  description:
    "Safety wrapper that catches a rendering error in the content inside it and shows a calm fallback instead of a blank page. Wrap any section that loads data or renders something that could fail. It has no text of its own to write.",
  slots: ["default"],
  charLimits: {},
} satisfies CatalogMeta;
