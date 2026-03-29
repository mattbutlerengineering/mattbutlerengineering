import { describe, it, expect } from "vitest";
import { routeModel, routeModelWithReason, resolveModelId } from "../model-router.js";
import type { IssueInput, ModelTier } from "../model-router.js";

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
