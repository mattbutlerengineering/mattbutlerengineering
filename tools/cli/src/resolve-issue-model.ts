/**
 * Resolve the model for a GitHub issue, frontmatter-override-first.
 *
 * The implement-queue skill dispatches each worker through the Agent tool and
 * needs a concrete model string per issue. This module is the single seam that
 * decision flows through: an explicit `model:` in the issue's ```yaml agent
 * block wins (matching the `mbe agent run` path), otherwise the shared
 * `routeModel` heuristic decides from labels + title + body.
 */
import { resolveModelId, routeModelWithReason, type ModelTier } from "@mbe/agent-core";
import { parseAgentFrontmatter } from "./issue-frontmatter.js";

export interface IssueModelInput {
  readonly title: string;
  readonly labels: string[];
  readonly body: string;
}

export interface IssueModelResult {
  readonly tier: ModelTier;
  readonly modelId: string;
  readonly reason: string;
  /** Where the decision came from: an explicit issue override vs. the router. */
  readonly source: "frontmatter" | "router" | "escalate";
}

/**
 * Return the escalated model result when the issue frontmatter declares an
 * `escalate:` tier. Returns null when no escalation is declared (no frontmatter,
 * no escalate field, or the escalate value failed validation).
 *
 * Used by the issue-worker after a failed initial run: call this, and if it
 * returns non-null, retry once at the returned tier. A failure at the escalated
 * tier goes to the agent-failed flow — no further escalation.
 */
export function resolveEscalatedModel(issue: IssueModelInput): IssueModelResult | null {
  const { overrides } = parseAgentFrontmatter(issue.body);
  if (!overrides?.escalate) return null;

  const tier = overrides.escalate;
  return {
    tier,
    modelId: resolveModelId(tier),
    reason: `Escalated from failed run: retrying at declared escalate tier (${tier})`,
    source: "escalate",
  };
}

export interface SpendAttempt {
  /** e.g. "issue-42.attempt-1" — unique per attempt, sortable */
  readonly sessionId: string;
  readonly modelId: string;
  readonly costUsd: number;
  readonly source: IssueModelResult["source"];
  /** true when this entry is the escalated retry */
  readonly escalated: boolean;
}

/**
 * Build distinct spend-log entries for one or two run attempts.
 *
 * Pass only the initial result + cost for a single-attempt run.
 * Pass all four arguments when an escalation retry occurred — the caller
 * feeds both entries to `mbe log-session` (or equivalent) so that each
 * attempt is recorded separately with its own model, cost, and sessionId.
 */
export function buildSpendAttempts(
  baseSessionId: string,
  initialResult: IssueModelResult,
  initialCostUsd: number,
  escalatedResult?: IssueModelResult,
  escalatedCostUsd?: number
): SpendAttempt[] {
  const first: SpendAttempt = {
    sessionId: `${baseSessionId}.attempt-1`,
    modelId: initialResult.modelId,
    costUsd: initialCostUsd,
    source: initialResult.source,
    escalated: false,
  };

  if (escalatedResult === undefined || escalatedCostUsd === undefined) {
    return [first];
  }

  const second: SpendAttempt = {
    sessionId: `${baseSessionId}.attempt-2`,
    modelId: escalatedResult.modelId,
    costUsd: escalatedCostUsd,
    source: escalatedResult.source,
    escalated: true,
  };

  return [first, second];
}

export function resolveIssueModel(issue: IssueModelInput): IssueModelResult {
  const { overrides } = parseAgentFrontmatter(issue.body);

  if (overrides?.model) {
    return {
      tier: overrides.model,
      modelId: resolveModelId(overrides.model),
      reason: "Explicit agent frontmatter override",
      source: "frontmatter",
    };
  }

  const routed = routeModelWithReason(issue);
  return {
    tier: routed.tier,
    modelId: routed.modelId,
    reason: routed.reason,
    source: "router",
  };
}
