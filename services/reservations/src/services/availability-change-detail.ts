import {
  AvailabilityChangeDetailSchema,
  type AvailabilityChangeDetail,
  type ClosureAction,
  type DateRule,
  type TonightChange,
} from "@mbe/types";
import type { ConfigDiff } from "./availability-config-plan.js";

/**
 * The stable code and data of an audit row (`availability_changes.summary_detail`), written beside
 * its English `summary`. The server never words them in another language: a client maps the code
 * to its own catalog and falls back to `summary` for a row with none (docs/features/localization).
 */

const count = (part: Record<string, readonly unknown[]>) =>
  Object.values(part).reduce((n, rows) => n + rows.length, 0);

export function configSavedDetail(diff: ConfigDiff): AvailabilityChangeDetail {
  return {
    code: "config_saved",
    added: count(diff.create),
    changed: count(diff.update),
    removed: count(diff.remove),
  };
}

/** A saved closure, or a close-early (a `tonight` rule saved through the closure command). */
export function closureDetail(
  rule: Pick<DateRule, "kind" | "startsOn" | "endsOn">,
  counts: Record<ClosureAction, number>
): AvailabilityChangeDetail {
  return {
    code: rule.kind === "tonight" ? "close_early_saved" : "closure_saved",
    startsOn: rule.startsOn,
    endsOn: rule.endsOn ?? null,
    cancelled: counts.cancel,
    moved: counts.move,
    kept: counts.keep_notify + counts.keep_silent,
  };
}

export const reopenedDetail = (startsOn: string): AvailabilityChangeDetail => ({
  code: "closure_reopened",
  startsOn,
});

export function tonightDetail(change: TonightChange): AvailabilityChangeDetail {
  switch (change.type) {
    case "pause_online":
      return { code: "tonight_pause_online" };
    case "close_early":
      return { code: "tonight_close_early" };
    case "stop_window":
      return { code: "tonight_stop_window" };
    case "block_tables":
      return { code: "tonight_block_tables", tables: change.tableIds.length };
    case "pacing":
      return { code: "tonight_pacing", covers: change.covers };
  }
}

export const tonightEndedDetail = (): AvailabilityChangeDetail => ({ code: "tonight_ended" });

/** Reads a stored detail; `null` for a row written before details, or one that is not shaped like one. */
export function readDetail(value: unknown): AvailabilityChangeDetail | null {
  const parsed = AvailabilityChangeDetailSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * A revert's detail: the reverted change's, marked. `null` when that change has none, so the
 * revert too is shown as its English `Reverted: …` summary rather than a half-worded sentence.
 */
export function revertedDetail(original: unknown): AvailabilityChangeDetail | null {
  const detail = readDetail(original);
  return detail ? { ...detail, reverted: true } : null;
}
