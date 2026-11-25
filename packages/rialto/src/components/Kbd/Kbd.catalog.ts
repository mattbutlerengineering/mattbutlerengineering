import type { CatalogMeta } from "../catalog-meta";

export const kbdCatalogMeta = {
  name: "Kbd",
  description:
    "Keyboard key cap for showing one key, such as Esc or K, inside help text or a hint. Put the key name in children.",
  propSchemas: {
    children: "z.string().max(12)",
  },
} satisfies CatalogMeta;
