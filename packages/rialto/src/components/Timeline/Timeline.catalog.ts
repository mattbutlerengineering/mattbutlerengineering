/**
 * Catalog metadata for the Timeline component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const timelineCatalogMeta = {
  name: "Timeline",
  description:
    "A time-ordered sequence of events, such as tonight's reservations in arrival order or a guest's visit history. Each event has a title, optional description and timestamp (display text such as 7:30 PM), and status=completed|active|upcoming|error. Use compact=true for long lists.",
  // Nested strings carry no .max(): the seam clamps only top-level charLimits, so a
  // nested limit would drop the whole Timeline over one long title (F13).
  propSchemas: {
    events:
      'z.array(z.object({ title: z.string(), description: z.string().optional(), timestamp: z.string().optional(), status: z.enum(["completed", "active", "upcoming", "error"]).optional() }))',
  },
} satisfies CatalogMeta;
