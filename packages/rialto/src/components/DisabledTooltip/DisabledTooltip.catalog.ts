import type { CatalogMeta } from "../catalog-meta";

export const disabledTooltipCatalogMeta = {
  name: "DisabledTooltip",
  description:
    "Wraps a control and explains why it is unavailable. Set disabled=true and give disabledReason a short sentence such as why a table cannot be booked; with no reason it renders its child unchanged.",
  slots: ["default"],
  charLimits: {
    disabledReason: 120,
  },
} satisfies CatalogMeta;
