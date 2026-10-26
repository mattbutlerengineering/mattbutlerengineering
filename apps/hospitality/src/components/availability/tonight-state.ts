import type { DateRule } from "@mbe/types";

/** One Tonight change in force, as a header chip describes it (ux.md F7). */
export type TonightChange =
  | { readonly ruleId: string; readonly kind: "pause_online" }
  | { readonly ruleId: string; readonly kind: "close_early"; readonly closeAt: number }
  | {
      readonly ruleId: string;
      readonly kind: "stop_window";
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly ruleId: string;
      readonly kind: "block_tables";
      readonly tableCount: number;
      readonly from: number;
      readonly to: number;
    }
  | { readonly ruleId: string; readonly kind: "pacing"; readonly covers: number };

type TonightRule = Extract<DateRule, { kind: "tonight" }>;

function describe(rule: TonightRule): TonightChange | null {
  const ruleId = rule.id;
  const { payload } = rule;
  if ("closeAt" in payload) return { ruleId, kind: "close_early", closeAt: payload.closeAt };
  if ("pacing" in payload) return { ruleId, kind: "pacing", covers: payload.pacing.covers };
  if (rule.targetKind === "booking") return { ruleId, kind: "pause_online" };
  if (rule.targetKind === "tables") {
    return {
      ruleId,
      kind: "block_tables",
      tableCount: rule.tableIds?.length ?? 0,
      from: payload.stop.from,
      to: payload.stop.to,
    };
  }
  return { ruleId, kind: "stop_window", from: payload.stop.from, to: payload.stop.to };
}

/** The Tonight rules for `today` that have not yet reached their service-day boundary. */
export function activeTonightChanges(
  rules: readonly DateRule[],
  today: string,
  now: Date
): readonly TonightChange[] {
  return rules.flatMap((rule) => {
    if (rule.kind !== "tonight" || rule.startsOn !== today) return [];
    if (rule.expiresAt && new Date(rule.expiresAt).getTime() <= now.getTime()) return [];
    const change = describe(rule);
    return change ? [change] : [];
  });
}
