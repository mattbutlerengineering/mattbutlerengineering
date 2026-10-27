/**
 * The playground has no state store. A model that binds Table/DataTable `data`
 * to `{ "$state": "/users" }` fails schema validation (data must be an array)
 * and the seam renders "Component could not be displayed" while the generation
 * is still marked complete. Replace a non-array `data` value with a short
 * deterministic sample so the table renders. Real arrays, including `[]`,
 * are left alone so `emptyMessage` still works.
 */

const SAMPLE_ROW_COUNT = 8;

const SAMPLE_NAMES = [
  "Alex Rivera",
  "Jordan Lee",
  "Sam Patel",
  "Riley Chen",
  "Casey Nguyen",
  "Morgan Brooks",
  "Quinn Alvarez",
  "Avery Singh",
] as const;

const SAMPLE_STATUSES = ["Active", "Invited", "Suspended"] as const;
const SAMPLE_ROLES = ["Admin", "Member", "Viewer"] as const;

function columnKeys(columns: unknown): string[] {
  if (!Array.isArray(columns)) return [];
  return columns.flatMap((column) => {
    if (column === null || typeof column !== "object") return [];
    const key = (column as { key?: unknown }).key;
    return typeof key === "string" && key !== "" ? [key] : [];
  });
}

function sampleCell(key: string, index: number): string {
  const normalized = key.toLowerCase();
  if (normalized.includes("email")) return `user${index + 1}@example.com`;
  if (normalized.includes("name")) return SAMPLE_NAMES[index % SAMPLE_NAMES.length] ?? key;
  if (normalized.includes("status")) return SAMPLE_STATUSES[index % SAMPLE_STATUSES.length] ?? key;
  if (normalized.includes("role")) return SAMPLE_ROLES[index % SAMPLE_ROLES.length] ?? key;
  if (normalized === "id" || normalized.endsWith("id")) return String(index + 1);
  return `${key} ${index + 1}`;
}

/** Props for one element, with Table/DataTable state bindings turned into rows. */
export function materializeCatalogProps(name: string, props: unknown): unknown {
  if (name !== "Table" && name !== "DataTable") return props;
  if (props === null || typeof props !== "object") return props;
  const source = props as Record<string, unknown>;
  if (Array.isArray(source.data)) return props;
  const keys = columnKeys(source.columns);
  if (keys.length === 0) return props;
  const data = Array.from({ length: SAMPLE_ROW_COUNT }, (_, index) => {
    const row: Record<string, string> = {};
    for (const key of keys) row[key] = sampleCell(key, index);
    return row;
  });
  return { ...source, data };
}
