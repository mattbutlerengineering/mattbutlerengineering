import {
  createWorktree,
  hasChanges,
  commitChanges,
  pushBranch,
  removeWorktree,
} from "../worktree-manager.js";
import { buildSystemPrompt, loadSourceFiles, loadProjectContext } from "../prompt-builder.js";
import { loadMemory, queryPastFailures, buildFailureContext } from "../failure-memory.js";
import { runHardenedQuery } from "../run-hardened-query.js";
import { getGitDiff } from "../success-evaluator.js";
import { runPostCommitGateway } from "../post-commit-gateway.js";
import { createPullRequest, buildPrTitle, buildPrBody, buildFailurePrBody } from "../pr-creator.js";
import { mergeDirectly } from "../dep-bump-merger.js";
import { runFeedbackLoop } from "../feedback-loop.js";
import type { PhaseDeps } from "./pipeline-types.js";

/**
 * Wires the real agent-core module implementations into the injectable
 * `PhaseDeps` bundle. `runSession()` uses this by default; tests pass a
 * partial fake instead of `vi.mock`-ing each module.
 */
export function createDefaultPhaseDeps(): PhaseDeps {
  return {
    worktreeManager: {
      createWorktree,
      hasChanges,
      commitChanges,
      pushBranch,
      removeWorktree,
    },
    promptBuilder: {
      buildSystemPrompt,
      loadSourceFiles,
      loadProjectContext,
    },
    failureMemory: {
      loadMemory,
      queryPastFailures,
      buildFailureContext,
    },
    queryRunner: {
      runHardenedQuery,
    },
    successEvaluator: {
      getGitDiff,
    },
    gateway: {
      runPostCommitGateway,
    },
    prCreator: {
      createPullRequest,
      buildPrTitle,
      buildPrBody,
      buildFailurePrBody,
      mergeDirectly,
    },
    feedbackLoop: {
      runFeedbackLoop,
    },
  };
}
