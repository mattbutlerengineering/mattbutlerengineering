import type { AdapterType } from "../adapter-resolution.js";
import type { TaskBudget } from "./types.js";

/**
 * What an adapter's reported `costUsd` actually means.
 *
 * - `billed` — real money on an API key (the SDK adapter, opencode, grok
 *   when the server stamps `total_cost_usd`, and the `auto` cascade whose
 *   first member is the SDK adapter). Grok omits the figure on OAuth, and
 *   the session runner records that absence as $0, so the cost arm does
 *   not false-fail those runs.
 * - `api-equivalent` — a real figure the CLI computes at API prices, but not
 *   billed. `claude-cli` runs on a subscription login, and its turn-1 number
 *   is inflated by the repo's cached CLAUDE.md/rules context. `omp` reports
 *   pi's API-price `usage.cost.total`; a subscription or OAuth run is an
 *   estimate, not a bill.
 * - `none` — reserved for an adapter whose output never carries a USD
 *   figure. No current adapter returns it. `isWithinBudget` still treats it
 *   like `api-equivalent` (turns arm only).
 *
 * The eval already keys adapter-specific knowledge by `AdapterType`
 * (`loadCostBaseline`, `noRunMessage`); this names the one rule they left
 * implicit — which runs the budget's cost arm applies to.
 */
export type CostBasis = "billed" | "api-equivalent" | "none";

/** Total over the `AdapterType` union — adding an adapter fails typecheck here until a basis is chosen. */
export function costBasisForAdapter(adapterType: AdapterType): CostBasis {
  switch (adapterType) {
    case "claude":
    case "opencode":
    case "grok":
    case "auto":
      return "billed";
    case "claude-cli":
    case "omp":
      return "api-equivalent";
  }
}

/**
 * The budget's turns arm always applies; its cost arm applies only when the
 * reported figure is billed money. The `billed` branch is bit-identical to
 * the inline expression `agent-eval.ts` used before this existed, so scoring
 * under `claude`/`opencode`/`auto` cannot change.
 */
export function isWithinBudget(
  usage: { readonly costUsd: number; readonly numTurns: number },
  budget: TaskBudget,
  costBasis: CostBasis
): boolean {
  return (
    usage.numTurns <= budget.maxTurns &&
    (costBasis !== "billed" || usage.costUsd <= budget.maxCostUsd)
  );
}
