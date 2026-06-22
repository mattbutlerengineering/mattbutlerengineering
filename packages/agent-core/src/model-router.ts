import { classifyTask } from "./task-signal-registry.js";
import type { TaskSignals } from "./task-signal-registry.js";
import { MODEL_IDS } from "./model-registry.js";
import { isTestFile, isDocFile } from "./file-classifier.js";

export { resolveModelId, getFeedbackLoopModel } from "./model-registry.js";

// ── Types ───────────────────────────────────────────────────────────

export type ModelTier = "haiku" | "sonnet" | "opus";

export interface IssueInput {
  readonly title: string;
  readonly labels: string[];
  readonly body: string;
}

/**
 * Optional runtime context that extends static issue metadata for routing.
 * All fields are optional — existing callers without context are unaffected.
 */
export interface RoutingContext {
  /** Remaining session budget in USD. Used to downgrade opus when budget is tight. */
  readonly remainingBudgetUsd?: number;
  /** Resolved source file paths for this task. Used for file-count signals. */
  readonly sourceFilePaths?: readonly string[];
  /** Model tier that was used when a similar task previously failed. Used for escalation. */
  readonly pastFailureTier?: ModelTier;
  /**
   * Pre-computed task signals from the shared TaskSignalRegistry. When omitted,
   * routing computes them from the issue title/body so existing callers are
   * unaffected. Passing this avoids re-scanning the description.
   */
  readonly taskSignals?: TaskSignals;
}

export interface ModelRoutingResult {
  readonly tier: ModelTier;
  readonly modelId: string;
  readonly reason: string;
}

// ── Constants ───────────────────────────────────────────────────────

/** Budget threshold below which an opus routing is downgraded to sonnet. */
const OPUS_MIN_BUDGET_USD = 0.3;

/** Source file count above which a feature task is upgraded to opus. */
const LARGE_CHANGE_FILE_THRESHOLD = 15;

// ── Routing logic ────────────────────────────────────────────────────

/**
 * Determine the appropriate model tier for an issue based on its labels,
 * title, body content, and optional runtime context.
 *
 * Priority order (first match wins):
 * 1. Dependency bumps / security / docs / test / lint / style → haiku
 * 2. Task touches only test or docs files (≤2 paths) → haiku
 * 3. CI fixes → sonnet
 * 4. Features with architecture/complexity keywords → opus
 * 5. Feature touching >15 source files → opus
 * 6. Feature label (simple scope) → sonnet
 * 7. Default → sonnet
 *
 * Post-processing (applied after base tier):
 * - haiku + previously failed at haiku → escalate to sonnet
 * - opus + remaining budget < $0.30 → downgrade to sonnet
 */
export function routeModel(issue: IssueInput, ctx?: RoutingContext): ModelTier {
  const { tier } = routeModelWithReason(issue, ctx);
  return tier;
}

/**
 * Same as `routeModel` but also returns the model ID and the reason
 * for the routing decision. Useful for logging and observability.
 */
export function routeModelWithReason(issue: IssueInput, ctx?: RoutingContext): ModelRoutingResult {
  const labels = issue.labels.map((l) => l.toLowerCase());

  // Shared task signals: prefer a pre-computed value, otherwise derive from the
  // issue (title prefix drives the lightweight "trivial" signal; combined
  // title+body drives the complexity tier).
  const signals = ctx?.taskSignals ?? classifyTask(`${issue.title} ${issue.body}`, issue.title);

  // 1. Lightweight title prefixes (deps/security/docs/test/lint/style) → haiku (~30s)
  if (signals.tier === "trivial") {
    return applyContextAdjustments(buildResult("haiku", "Title matches lightweight pattern"), ctx);
  }

  // 2. Task touches only test or docs files (≤2 paths) → haiku
  if (ctx?.sourceFilePaths && isTestOrDocsOnlyTask(ctx.sourceFilePaths)) {
    return applyContextAdjustments(
      buildResult("haiku", "Task touches only test or docs files (≤2 paths)"),
      ctx
    );
  }

  // 3. CI fixes → sonnet (~2 min)
  if (labels.includes("ci-fix")) {
    return applyContextAdjustments(buildResult("sonnet", "Issue has ci-fix label"), ctx);
  }

  // 4. Feature with architectural/complex keywords → opus (~5-10 min)
  if (labels.includes("feature")) {
    if (signals.tier === "complex") {
      return applyContextAdjustments(
        buildResult("opus", "Feature with complexity keyword from task signals"),
        ctx
      );
    }

    // 5. Feature touching many files → opus
    if (ctx?.sourceFilePaths && ctx.sourceFilePaths.length > LARGE_CHANGE_FILE_THRESHOLD) {
      return applyContextAdjustments(
        buildResult(
          "opus",
          `Feature touching ${ctx.sourceFilePaths.length} source files (>${LARGE_CHANGE_FILE_THRESHOLD})`
        ),
        ctx
      );
    }

    // 6. Feature label but no complexity signals → sonnet (~3-5 min)
    return applyContextAdjustments(buildResult("sonnet", "Feature label with simple scope"), ctx);
  }

  // 7. Default → sonnet
  return applyContextAdjustments(
    buildResult("sonnet", "Default routing: no specific pattern matched"),
    ctx
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildResult(tier: ModelTier, reason: string): ModelRoutingResult {
  return { tier, modelId: MODEL_IDS[tier], reason };
}

/**
 * Apply runtime context adjustments after the base tier is determined.
 *
 * - Failure escalation: haiku previously failed on a similar task → use sonnet
 * - Budget safety valve: opus chosen but budget is too low → downgrade to sonnet
 */
function applyContextAdjustments(
  result: ModelRoutingResult,
  ctx?: RoutingContext
): ModelRoutingResult {
  if (!ctx) return result;

  // Escalate if haiku previously failed on a similar task
  if (result.tier === "haiku" && ctx.pastFailureTier === "haiku") {
    return buildResult(
      "sonnet",
      "Escalated from haiku: previous attempt at haiku tier failed for similar task"
    );
  }

  // Budget safety valve: opus requires ~$0.40–1.50; skip it when budget is tight
  if (
    result.tier === "opus" &&
    ctx.remainingBudgetUsd !== undefined &&
    ctx.remainingBudgetUsd < OPUS_MIN_BUDGET_USD
  ) {
    return buildResult(
      "sonnet",
      `Budget-constrained downgrade from opus: $${ctx.remainingBudgetUsd.toFixed(2)} remaining (minimum $${OPUS_MIN_BUDGET_USD})`
    );
  }

  return result;
}

/**
 * Return true when the task's resolved source paths consist entirely of
 * test or documentation files (≤2 paths). These tasks rarely require
 * more reasoning than haiku provides.
 */
function isTestOrDocsOnlyTask(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.length <= 2 && paths.every((p) => isTestFile(p) || isDocFile(p));
}
