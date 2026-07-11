/**
 * Catalog metadata for the DataTable component. Read by the @mbe/rialto-catalog
 * generator to emit the Zod prop schema, AI description, and registry mapping.
 */
import type { CatalogMeta } from "../catalog-meta";

export const dataTableCatalogMeta = {
  name: "DataTable",
  description:
    "Sortable, selectable data grid built on a native table with grid ARIA. Use for interactive tabular data that needs column sorting (asc/desc/none) or row selection. Provide columns (key, header, sortable, rowHeader) and data arrays plus rowKey. Set selectionMode to single or multiple to add accessible selection checkboxes and a select-all. Prefer plain Table for read-only presentational tables.",
  charLimits: {
    emptyMessage: 60,
  },
  propSchemas: {
    columns:
      'z.array(z.object({ key: z.string(), header: z.string(), sortable: z.boolean().optional(), align: z.enum(["left", "center", "right"]).optional(), width: z.string().optional(), rowHeader: z.boolean().optional() }))',
    data: "z.array(z.record(z.string(), z.unknown()))",
  },
} satisfies CatalogMeta;
