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
  readonly source: "frontmatter" | "router";
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
