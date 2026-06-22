import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import { generatedSchemas } from "./generated-schemas.js";
import { catalogMeta } from "./generated-catalog.js";

/* ── Build components map ────────────────────── */

// Merge generated Zod schemas with the co-located metadata (descriptions, slots).
// Both artifacts come from one generator pass over the `*.catalog.ts` source,
// so schema, description, and renderer cannot drift. Components with
// include: false stay in the metadata but are excluded from the AI catalog.
const components = Object.fromEntries(
  Object.entries(catalogMeta)
    .filter(([, meta]) => meta.include !== false)
    .map(([name, meta]) => {
      const propsSchema = generatedSchemas[name as keyof typeof generatedSchemas];

      const entry: {
        props: z.ZodType;
        description: string;
        slots?: string[];
      } = {
        props: propsSchema as z.ZodType,
        description: meta.description,
      };

      if (meta.slots && meta.slots.length > 0) {
        entry.slots = [...meta.slots];
      }

      return [name, entry];
    })
);

/* ── Define catalog ──────────────────────────── */

export const catalog = defineCatalog(schema, {
  components,
  actions: {
    // setState, pushState, and removeState are BUILT-IN to the React schema.
    // Do NOT re-declare them here — they are auto-injected into prompts by json-render.

    validateForm: {
      params: z.object({ formId: z.string() }),
      description:
        "Validate all inputs in a form and show validation errors. Call before submitting to check required fields and constraints.",
    },
    navigate: {
      params: z.object({ path: z.string() }),
      description:
        "Navigate to a path within the app. Use for in-app routing after form submissions, button clicks, or list item selections.",
    },
  },
});
