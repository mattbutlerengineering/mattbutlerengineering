import type { AvailabilityConfig } from "@mbe/types";
import { CONFIG_TABLES, type ConfigDiff } from "./availability-config-plan.js";

/**
 * The issues on rows the change creates or updates, and only those: a command that must work on
 * a venue already holding some unrelated invalid row (a Host reopening during service) is not
 * answerable for it. An issue that names no row (`no_regular_schedule`) is not about a touched row.
 */
export function touchedIssues<I extends { path: string }>(
  issues: readonly I[],
  next: AvailabilityConfig,
  diff: ConfigDiff
): I[] {
  const touched = new Set(
    CONFIG_TABLES.flatMap((table) => {
      const ids = new Set(
        [...diff.create[table], ...diff.update[table]].map((r) => (r as { id: string }).id)
      );
      return (next[table] as { id: string }[]).flatMap((row, i) =>
        ids.has(row.id) ? [`${table}[${i}]`] : []
      );
    })
  );
  return issues.filter((issue) => {
    const row = /^\w+\[\d+\]/.exec(issue.path);
    return row !== null && touched.has(row[0]);
  });
}
