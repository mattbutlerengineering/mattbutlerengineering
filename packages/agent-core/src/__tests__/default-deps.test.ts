import { describe, it, expect } from "vitest";
import { createDefaultPhaseDeps } from "../phases/index.js";

describe("createDefaultPhaseDeps", () => {
  it("wires every collaborator group with real module functions", () => {
    const deps = createDefaultPhaseDeps();

    expect(typeof deps.worktreeManager.createWorktree).toBe("function");
    expect(typeof deps.worktreeManager.hasChanges).toBe("function");
    expect(typeof deps.worktreeManager.commitChanges).toBe("function");
    expect(typeof deps.worktreeManager.pushBranch).toBe("function");
    expect(typeof deps.worktreeManager.removeWorktree).toBe("function");

    expect(typeof deps.promptBuilder.buildSystemPrompt).toBe("function");
    expect(typeof deps.promptBuilder.loadSourceFiles).toBe("function");
    expect(typeof deps.promptBuilder.loadProjectContext).toBe("function");

    expect(typeof deps.failureMemory.loadMemory).toBe("function");
    expect(typeof deps.failureMemory.queryPastFailures).toBe("function");
    expect(typeof deps.failureMemory.buildFailureContext).toBe("function");

    expect(typeof deps.queryRunner.runHardenedQuery).toBe("function");
    expect(typeof deps.successEvaluator.getGitDiff).toBe("function");
    expect(typeof deps.gateway.runPostCommitGateway).toBe("function");

    expect(typeof deps.prCreator.createPullRequest).toBe("function");
    expect(typeof deps.prCreator.buildPrTitle).toBe("function");
    expect(typeof deps.prCreator.buildPrBody).toBe("function");
    expect(typeof deps.prCreator.buildFailurePrBody).toBe("function");
    expect(typeof deps.prCreator.mergeDirectly).toBe("function");

    expect(typeof deps.feedbackLoop.runFeedbackLoop).toBe("function");
  });
});
