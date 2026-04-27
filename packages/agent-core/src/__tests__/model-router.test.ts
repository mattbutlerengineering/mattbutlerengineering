import { describe, it, expect } from "vitest";
import {
  routeModel,
  routeModelWithReason,
  resolveModelId,
  getFeedbackLoopModel,
} from "../model-router.js";
import type { IssueInput, ModelTier, RoutingContext } from "../model-router.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<IssueInput> = {}): IssueInput {
  return {
    title: "Some issue",
    labels: [],
    body: "",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("routeModel", () => {
  describe("haiku tier — dependency bumps and security fixes", () => {
    it("routes chore(deps): title to haiku", () => {
      const issue = makeIssue({ title: "chore(deps): bump lodash from 4.17.20 to 4.17.21" });
      expect(routeModel(issue)).toBe("haiku");
    });

    it("routes chore(deps-dev): title to haiku", () => {
      const issue = makeIssue({ title: "chore(deps-dev): bump typescript from 5.0 to 5.4" });
      expect(routeModel(issue)).toBe("haiku");
    });

    it("routes fix(security): title to haiku", () => {
      const issue = makeIssue({ title: "fix(security): patch CVE-2024-1234 in axios" });
      expect(routeModel(issue)).toBe("haiku");
    });

    it("is case-insensitive for title patterns", () => {
      const issue = makeIssue({ title: "CHORE(DEPS): bump react to 19" });
      expect(routeModel(issue)).toBe("haiku");
    });

    it("does not route to haiku when fix is not security-scoped", () => {
      const issue = makeIssue({ title: "fix: correct login redirect bug" });
      expect(routeModel(issue)).not.toBe("haiku");
    });

    it("does not route to haiku when chore is not deps-scoped", () => {
      const issue = makeIssue({ title: "chore: update README" });
      expect(routeModel(issue)).not.toBe("haiku");
    });
  });

  describe("sonnet tier — ci-fix label", () => {
    it("routes ci-fix label to sonnet", () => {
      const issue = makeIssue({ labels: ["ci-fix"], title: "Fix flaky integration test" });
      expect(routeModel(issue)).toBe("sonnet");
    });

    it("routes ci-fix label to sonnet even with feature label present", () => {
      // ci-fix takes priority over feature because it matches earlier in the chain
      // (ci-fix check precedes feature check)
      const issue = makeIssue({ labels: ["ci-fix", "feature"], title: "Fix CI pipeline" });
      expect(routeModel(issue)).toBe("sonnet");
    });
  });

  describe("opus tier — feature with architectural complexity", () => {
    const opusTriggers: Array<{ keyword: string; field: "title" | "body" }> = [
      { keyword: "architecture", field: "title" },
      { keyword: "architectural", field: "title" },
      { keyword: "refactor", field: "title" },
      { keyword: "design system", field: "title" },
      { keyword: "migration", field: "title" },
      { keyword: "migrate", field: "title" },
      { keyword: "infrastructure", field: "title" },
      { keyword: "breaking change", field: "body" },
      { keyword: "api design", field: "body" },
      { keyword: "system design", field: "body" },
      { keyword: "schema change", field: "body" },
      { keyword: "multi-service", field: "body" },
      { keyword: "cross-cutting", field: "body" },
    ];

    for (const { keyword, field } of opusTriggers) {
      it(`routes feature with "${keyword}" in ${field} to opus`, () => {
        const issue = makeIssue({
          labels: ["feature"],
          title: field === "title" ? `Add ${keyword} overhaul` : "Add new feature",
          body: field === "body" ? `This involves a ${keyword} concern` : "",
        });
        expect(routeModel(issue)).toBe("opus");
      });
    }

    it("is case-insensitive for complexity keywords", () => {
      const issue = makeIssue({
        labels: ["feature"],
        title: "ARCHITECTURE overhaul for auth system",
      });
      expect(routeModel(issue)).toBe("opus");
    });

    it("matches complexity keywords in body as well as title", () => {
      const issue = makeIssue({
        labels: ["feature"],
        title: "Add multi-tenant support",
        body: "This requires a schema change across all services and a migration strategy.",
      });
      expect(routeModel(issue)).toBe("opus");
    });
  });

  describe("sonnet tier — simple feature", () => {
    it("routes feature label with no complexity keywords to sonnet", () => {
      const issue = makeIssue({
        labels: ["feature"],
        title: "Add export button to dashboard",
        body: "Users want to export their data as CSV.",
      });
      expect(routeModel(issue)).toBe("sonnet");
    });

    it("routes feature label to sonnet when body is empty", () => {
      const issue = makeIssue({ labels: ["feature"], title: "Add dark mode toggle" });
      expect(routeModel(issue)).toBe("sonnet");
    });
  });

  describe("default routing", () => {
    it("defaults to sonnet for an issue with no labels and generic title", () => {
      const issue = makeIssue({ title: "Fix typo in dashboard header" });
      expect(routeModel(issue)).toBe("sonnet");
    });

    it("defaults to sonnet for an issue with unrecognised labels", () => {
      const issue = makeIssue({ labels: ["bug", "ui"], title: "Button misaligned on mobile" });
      expect(routeModel(issue)).toBe("sonnet");
    });

    it("defaults to sonnet for empty issue", () => {
      const issue = makeIssue();
      expect(routeModel(issue)).toBe("sonnet");
    });
  });

  describe("label matching is case-insensitive", () => {
    it("matches CI-Fix label regardless of case", () => {
      const issue = makeIssue({ labels: ["CI-Fix"] });
      expect(routeModel(issue)).toBe("sonnet");
    });

    it("matches Feature label regardless of case", () => {
      const issue = makeIssue({ labels: ["Feature"], title: "Add user search" });
      expect(routeModel(issue)).toBe("sonnet");
    });
  });
});

describe("routeModelWithReason", () => {
  it("returns tier, modelId, and a reason string", () => {
    const issue = makeIssue({ title: "chore(deps): bump express to 5.0" });
    const result = routeModelWithReason(issue);

    expect(result.tier).toBe("haiku");
    expect(result.modelId).toBe("claude-haiku-4-5-20251001");
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe("string");
  });

  it("includes the matched pattern description in the reason for haiku", () => {
    const issue = makeIssue({ title: "chore(deps): bump vitest" });
    const result = routeModelWithReason(issue);

    expect(result.reason).toMatch(/lightweight pattern/i);
  });

  it("includes label name in reason for ci-fix", () => {
    const issue = makeIssue({ labels: ["ci-fix"] });
    const result = routeModelWithReason(issue);

    expect(result.reason).toMatch(/ci-fix/i);
  });

  it("includes complexity keyword in reason for opus", () => {
    const issue = makeIssue({ labels: ["feature"], title: "Refactor auth architecture" });
    const result = routeModelWithReason(issue);

    expect(result.tier).toBe("opus");
    expect(result.reason).toMatch(/complexity keyword/i);
  });

  it("states simple scope in reason for plain feature", () => {
    const issue = makeIssue({ labels: ["feature"], title: "Add tooltip component" });
    const result = routeModelWithReason(issue);

    expect(result.tier).toBe("sonnet");
    expect(result.reason).toMatch(/simple scope/i);
  });

  it("states default routing in reason when nothing matches", () => {
    const issue = makeIssue({ title: "Update color token" });
    const result = routeModelWithReason(issue);

    expect(result.tier).toBe("sonnet");
    expect(result.reason).toMatch(/default/i);
  });
});

describe("resolveModelId", () => {
  const cases: Array<[ModelTier, string]> = [
    ["haiku", "claude-haiku-4-5-20251001"],
    ["sonnet", "claude-sonnet-4-6"],
    ["opus", "claude-opus-4-6"],
  ];

  for (const [tier, expectedId] of cases) {
    it(`resolves ${tier} to ${expectedId}`, () => {
      expect(resolveModelId(tier)).toBe(expectedId);
    });
  }
});

describe("priority ordering", () => {
  it("haiku takes priority over feature label", () => {
    // A dep-bump PR that somehow also has a feature label should still go to haiku
    const issue = makeIssue({
      title: "chore(deps): bump react",
      labels: ["feature"],
    });
    expect(routeModel(issue)).toBe("haiku");
  });

  it("haiku takes priority over ci-fix label", () => {
    const issue = makeIssue({
      title: "chore(deps): bump eslint",
      labels: ["ci-fix"],
    });
    expect(routeModel(issue)).toBe("haiku");
  });

  it("ci-fix takes priority over feature/simple-scope", () => {
    // ci-fix label check runs before feature complexity check
    const issue = makeIssue({
      title: "Fix broken CI step",
      labels: ["ci-fix", "feature"],
      body: "No architectural concerns here.",
    });
    expect(routeModel(issue)).toBe("sonnet");
  });
});

// ── New haiku title patterns ──────────────────────────────────────────

describe("haiku tier — new lightweight title patterns", () => {
  it("routes docs: title to haiku", () => {
    expect(routeModel(makeIssue({ title: "docs: update README with new env vars" }))).toBe("haiku");
  });

  it("routes test: title to haiku", () => {
    expect(routeModel(makeIssue({ title: "test: add coverage for auth edge cases" }))).toBe("haiku");
  });

  it("routes chore(lint): title to haiku", () => {
    expect(routeModel(makeIssue({ title: "chore(lint): fix ESLint violations in utils" }))).toBe(
      "haiku"
    );
  });

  it("routes chore(style): title to haiku", () => {
    expect(routeModel(makeIssue({ title: "chore(style): apply Prettier formatting" }))).toBe(
      "haiku"
    );
  });

  it("is case-insensitive for new patterns", () => {
    expect(routeModel(makeIssue({ title: "DOCS: fix typo in API reference" }))).toBe("haiku");
    expect(routeModel(makeIssue({ title: "TEST: add snapshot tests" }))).toBe("haiku");
  });

  it("does not route docs-scoped body content to haiku (title must match)", () => {
    const issue = makeIssue({ title: "fix: address docs link", body: "Update docs references" });
    expect(routeModel(issue)).not.toBe("haiku");
  });
});

// ── RoutingContext: source file paths signal ──────────────────────────

describe("RoutingContext — source file path signals", () => {
  it("routes to haiku when task touches only 1 test file", () => {
    const ctx: RoutingContext = {
      sourceFilePaths: ["packages/agent-core/src/__tests__/model-router.test.ts"],
    };
    expect(routeModel(makeIssue({ title: "Fix failing unit test" }), ctx)).toBe("haiku");
  });

  it("routes to haiku when task touches 2 docs files", () => {
    const ctx: RoutingContext = {
      sourceFilePaths: ["docs/api-reference.md", "README.md"],
    };
    expect(routeModel(makeIssue({ title: "Update API docs" }), ctx)).toBe("haiku");
  });

  it("does not route to haiku when test file count exceeds 2", () => {
    const ctx: RoutingContext = {
      sourceFilePaths: [
        "packages/a/src/__tests__/a.test.ts",
        "packages/b/src/__tests__/b.test.ts",
        "packages/c/src/__tests__/c.test.ts",
      ],
    };
    expect(routeModel(makeIssue({ title: "Fix tests" }), ctx)).not.toBe("haiku");
  });

  it("does not route to haiku when files include non-test/docs sources", () => {
    const ctx: RoutingContext = {
      sourceFilePaths: [
        "packages/agent-core/src/model-router.ts",
        "packages/agent-core/src/__tests__/model-router.test.ts",
      ],
    };
    expect(routeModel(makeIssue({ title: "Update router" }), ctx)).not.toBe("haiku");
  });

  it("upgrades feature to opus when >15 source files", () => {
    const ctx: RoutingContext = {
      sourceFilePaths: Array.from({ length: 16 }, (_, i) => `packages/svc/src/module${i}.ts`),
    };
    const issue = makeIssue({ labels: ["feature"], title: "Add multi-module refactor" });
    expect(routeModel(issue, ctx)).toBe("opus");
  });

  it("does not upgrade haiku title to opus even with many files", () => {
    const ctx: RoutingContext = {
      sourceFilePaths: Array.from({ length: 20 }, (_, i) => `packages/svc/src/module${i}.ts`),
    };
    const issue = makeIssue({ title: "chore(deps): bump react", labels: ["feature"] });
    expect(routeModel(issue, ctx)).toBe("haiku");
  });

  it("does not upgrade default (non-feature) to opus with many files", () => {
    const ctx: RoutingContext = {
      sourceFilePaths: Array.from({ length: 20 }, (_, i) => `packages/svc/src/module${i}.ts`),
    };
    const issue = makeIssue({ title: "Fix login bug" });
    expect(routeModel(issue, ctx)).toBe("sonnet");
  });

  it("does not upgrade feature to opus at exactly 15 files (boundary)", () => {
    const ctx: RoutingContext = {
      sourceFilePaths: Array.from({ length: 15 }, (_, i) => `packages/svc/src/module${i}.ts`),
    };
    const issue = makeIssue({ labels: ["feature"], title: "Add bulk export" });
    expect(routeModel(issue, ctx)).toBe("sonnet");
  });
});

// ── RoutingContext: failure escalation ───────────────────────────────

describe("RoutingContext — failure escalation", () => {
  it("escalates haiku to sonnet when pastFailureTier is haiku", () => {
    const ctx: RoutingContext = { pastFailureTier: "haiku" };
    const issue = makeIssue({ title: "chore(deps): bump lodash" });
    expect(routeModel(issue, ctx)).toBe("sonnet");
  });

  it("escalation reason mentions haiku failure", () => {
    const ctx: RoutingContext = { pastFailureTier: "haiku" };
    const issue = makeIssue({ title: "docs: fix README" });
    const result = routeModelWithReason(issue, ctx);
    expect(result.tier).toBe("sonnet");
    expect(result.reason).toMatch(/escalated.*haiku/i);
  });

  it("does not escalate sonnet even when pastFailureTier is sonnet", () => {
    const ctx: RoutingContext = { pastFailureTier: "sonnet" };
    const issue = makeIssue({ title: "Fix login bug" });
    expect(routeModel(issue, ctx)).toBe("sonnet");
  });

  it("does not escalate opus even when pastFailureTier is opus", () => {
    const ctx: RoutingContext = { pastFailureTier: "opus" };
    const issue = makeIssue({ labels: ["feature"], title: "Redesign architecture" });
    expect(routeModel(issue, ctx)).toBe("opus");
  });
});

// ── RoutingContext: budget safety valve ──────────────────────────────

describe("RoutingContext — budget-aware downgrade", () => {
  it("downgrades opus to sonnet when remaining budget < $0.30", () => {
    const ctx: RoutingContext = { remainingBudgetUsd: 0.25 };
    const issue = makeIssue({ labels: ["feature"], title: "Redesign auth architecture" });
    expect(routeModel(issue, ctx)).toBe("sonnet");
  });

  it("downgrade reason mentions budget amount", () => {
    const ctx: RoutingContext = { remainingBudgetUsd: 0.15 };
    const issue = makeIssue({ labels: ["feature"], title: "Redesign auth architecture" });
    const result = routeModelWithReason(issue, ctx);
    expect(result.tier).toBe("sonnet");
    expect(result.reason).toMatch(/budget/i);
    expect(result.reason).toContain("0.15");
  });

  it("does not downgrade opus when budget is exactly $0.30 (boundary)", () => {
    const ctx: RoutingContext = { remainingBudgetUsd: 0.30 };
    const issue = makeIssue({ labels: ["feature"], title: "Redesign auth architecture" });
    expect(routeModel(issue, ctx)).toBe("opus");
  });

  it("does not downgrade opus when budget is above $0.30", () => {
    const ctx: RoutingContext = { remainingBudgetUsd: 1.50 };
    const issue = makeIssue({ labels: ["feature"], title: "Redesign auth architecture" });
    expect(routeModel(issue, ctx)).toBe("opus");
  });

  it("does not downgrade sonnet when budget is low", () => {
    const ctx: RoutingContext = { remainingBudgetUsd: 0.10 };
    const issue = makeIssue({ title: "Fix login redirect" });
    expect(routeModel(issue, ctx)).toBe("sonnet");
  });

  it("budget downgrade wins over failure escalation when both apply", () => {
    // If haiku would escalate to sonnet (pastFailureTier), and sonnet would then be
    // checked for budget, the budget valve only applies to opus — sonnet stays sonnet.
    const ctx: RoutingContext = { pastFailureTier: "haiku", remainingBudgetUsd: 0.05 };
    const issue = makeIssue({ title: "chore(deps): bump vitest" });
    // escalated to sonnet, budget valve doesn't apply to sonnet → stays sonnet
    expect(routeModel(issue, ctx)).toBe("sonnet");
  });
});

// ── getFeedbackLoopModel ─────────────────────────────────────────────

describe("getFeedbackLoopModel", () => {
  it("downgrades opus parent to sonnet", () => {
    expect(getFeedbackLoopModel("claude-opus-4-6")).toBe("claude-sonnet-4-6");
  });

  it("downgrades sonnet parent to haiku", () => {
    expect(getFeedbackLoopModel("claude-sonnet-4-6")).toBe("claude-haiku-4-5-20251001");
  });

  it("keeps haiku at haiku (floor)", () => {
    expect(getFeedbackLoopModel("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5-20251001");
  });

  it("returns unknown model IDs unchanged", () => {
    expect(getFeedbackLoopModel("some-unknown-model")).toBe("some-unknown-model");
  });
});
