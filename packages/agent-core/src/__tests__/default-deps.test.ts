import { describe, it, expect } from "vitest";
import { createDefaultPhaseDeps } from "../phases/index.js";

describe("createDefaultPhaseDeps", () => {
  it("wires every remaining collaborator group with real module functions", () => {
    const deps = createDefaultPhaseDeps();

    expect(typeof deps.worktreeManager.createWorktree).toBe("function");
    expect(typeof deps.worktreeManager.hasChanges).toBe("function");
    expect(typeof deps.worktreeManager.commitChanges).toBe("function");
    expect(typeof deps.worktreeManager.pushBranch).toBe("function");
    expect(typeof deps.worktreeManager.commitAndPush).toBe("function");
    expect(typeof deps.worktreeManager.removeWorktree).toBe("function");

    expect(typeof deps.promptBuilder.buildSystemPrompt).toBe("function");
    expect(typeof deps.promptBuilder.loadSourceFiles).toBe("function");
    expect(typeof deps.promptBuilder.loadProjectContext).toBe("function");

    expect(typeof deps.queryRunner.runHardenedQuery).toBe("function");

    expect(typeof deps.prCreator.createPullRequest).toBe("function");
    expect(typeof deps.prCreator.buildPrTitle).toBe("function");
    expect(typeof deps.prCreator.buildPrBody).toBe("function");
    expect(typeof deps.prCreator.buildFailurePrBody).toBe("function");
    expect(typeof deps.prCreator.mergeDirectly).toBe("function");

    expect(typeof deps.feedbackLoop.runFeedbackLoop).toBe("function");
    expect(typeof deps.feedbackLoop.feedbackPoller.getRepoOwner).toBe("function");
  });

  it("collapses in-implementation collaborators to private phase imports (#3120)", () => {
    const deps = createDefaultPhaseDeps();

    // FailureMemory / SuccessEvaluator / Gateway are in-implementation
    // collaborators of individual phases, not cross-process ports. They are
    // now imported directly inside their owning phase rather than injected,
    // so `createDefaultPhaseDeps` no longer wires an adapter for them.
    expect(deps).not.toHaveProperty("failureMemory");
    expect(deps).not.toHaveProperty("successEvaluator");
    expect(deps).not.toHaveProperty("gateway");

    // What remains are the four cross-process / spawn-session ports that
    // production-vs-test genuinely varies (worktree manager, query runner,
    // PR creator, feedback loop) plus the prompt builder.
    expect(Object.keys(deps).sort()).toEqual(
      ["feedbackLoop", "prCreator", "promptBuilder", "queryRunner", "worktreeManager"].sort()
    );
  });
});
