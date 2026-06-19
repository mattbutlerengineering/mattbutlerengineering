import { describe, it, expect } from "vitest";
import { classifyTask } from "../task-signal-registry.js";
import type { TaskTier, TaskDomain, TaskSignals } from "../task-signal-registry.js";

// ── Helpers ───────────────────────────────────────────────────────────

function tier(description: string, titlePrefix?: string): TaskTier {
  return classifyTask(description, titlePrefix).tier;
}

function domains(description: string, titlePrefix?: string): readonly TaskDomain[] {
  return classifyTask(description, titlePrefix).domains;
}

function bundles(description: string, titlePrefix?: string): readonly string[] {
  return classifyTask(description, titlePrefix).contextBundles;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("classifyTask — tier classification", () => {
  // ── trivial (title-prefix signals) ─────────────────────────────────

  describe("trivial tier — matching title prefix", () => {
    it("chore(deps): prefix → trivial", () => {
      expect(tier("bump lodash from 4.17.20 to 4.17.21", "chore(deps): ")).toBe("trivial");
    });

    it("chore(deps-dev): prefix → trivial", () => {
      expect(tier("bump typescript to 5.4", "chore(deps-dev): ")).toBe("trivial");
    });

    it("fix(security): prefix → trivial", () => {
      expect(tier("patch CVE-2024-1234 in axios", "fix(security): ")).toBe("trivial");
    });

    it("docs: prefix → trivial", () => {
      expect(tier("update README", "docs: ")).toBe("trivial");
    });

    it("test: prefix → trivial", () => {
      expect(tier("add unit tests for auth module", "test: ")).toBe("trivial");
    });

    it("chore(lint): prefix → trivial", () => {
      expect(tier("fix lint warnings", "chore(lint): ")).toBe("trivial");
    });

    it("chore(style): prefix → trivial", () => {
      expect(tier("reformat files", "chore(style): ")).toBe("trivial");
    });

    it("non-matching title prefix → not trivial (falls through to description-based)", () => {
      // Unrecognized prefix — tier falls through to classifyTier(description)
      expect(tier("bump a package", "random-prefix: ")).not.toBe("trivial");
    });

    it("trivial tier takes priority over complex description", () => {
      // Even if the description would be classified complex, the title prefix wins
      expect(tier("architect a new multi-service infrastructure migration", "chore(deps): ")).toBe(
        "trivial"
      );
    });
  });

  // ── complex tier ───────────────────────────────────────────────────

  describe("complex tier — description keywords", () => {
    const complexCases: string[] = [
      "feat: add new payment system",
      "implement oauth2 flow",
      "design the new database schema",
      "architect the messaging layer",
      "new service for notifications",
      "migration from REST to GraphQL",
      "architecture review needed",
      "refactor the auth module",
      "design system overhaul",
      "infrastructure changes",
      "breaking change to the API",
      "api design for v2 endpoints",
      "system design document",
      "schema change for users table",
      "multi-service coordination",
      "cross-cutting concern: logging",
    ];

    for (const description of complexCases) {
      it(`"${description}" → complex`, () => {
        expect(tier(description)).toBe("complex");
      });
    }
  });

  // ── simple tier ────────────────────────────────────────────────────

  describe("simple tier — description keywords", () => {
    const simpleCases: string[] = [
      "fix lint errors",
      "fix typo in README",
      "rename the helper function",
      "bump version to 2.0.0",
      "update dep to latest",
      "fix import path",
    ];

    for (const description of simpleCases) {
      it(`"${description}" → simple`, () => {
        expect(tier(description)).toBe("simple");
      });
    }
  });

  // ── standard tier (default) ────────────────────────────────────────

  describe("standard tier — no signals match", () => {
    it("generic description with no keywords → standard", () => {
      expect(tier("update the user profile page")).toBe("standard");
    });

    it("empty description → standard", () => {
      expect(tier("")).toBe("standard");
    });

    it("description with no tier signals → standard", () => {
      expect(tier("add tooltip to the button component")).toBe("standard");
    });
  });

  // ── priority ordering ──────────────────────────────────────────────

  describe("tier priority: complex > simple > standard", () => {
    it("description matching both complex and simple patterns → complex wins", () => {
      // 'feat' (complex) + 'bump' (simple) in same description
      expect(tier("feat: bump the API version to add new endpoints")).toBe("complex");
    });
  });
});

// ── Domain classification ─────────────────────────────────────────────

describe("classifyTask — domain classification", () => {
  describe("dependency domain", () => {
    it("'depend' keyword → dependency domain", () => {
      expect(domains("update npm dependencies")).toContain("dependency");
    });

    it("'bump' keyword → dependency domain", () => {
      expect(domains("bump lodash to latest")).toContain("dependency");
    });

    it("'upgrade' keyword → dependency domain", () => {
      expect(domains("upgrade react to v19")).toContain("dependency");
    });

    it("'update dep' phrase → dependency domain", () => {
      expect(domains("update dep axios to 1.7.0")).toContain("dependency");
    });
  });

  describe("deploy domain", () => {
    it("'deploy' keyword → deploy domain", () => {
      expect(domains("deploy the marketing site")).toContain("deploy");
    });

    it("'wrangler' keyword → deploy domain", () => {
      expect(domains("fix wrangler config")).toContain("deploy");
    });

    it("'digitalocean' keyword → deploy domain", () => {
      expect(domains("configure digitalocean app spec")).toContain("deploy");
    });

    it("'doctl' keyword → deploy domain", () => {
      expect(domains("run doctl deployment")).toContain("deploy");
    });
  });

  describe("security domain", () => {
    it("'security' keyword → security domain", () => {
      expect(domains("security vulnerability in auth")).toContain("security");
    });

    it("'audit' keyword → security domain", () => {
      expect(domains("run a dependency audit")).toContain("security");
    });

    it("'auth' keyword → security domain", () => {
      expect(domains("fix auth session handling")).toContain("security");
    });

    it("'authorization' keyword → security domain", () => {
      expect(domains("add authorization middleware")).toContain("security");
    });
  });

  describe("test domain", () => {
    it("'test' keyword → test domain", () => {
      expect(domains("write test coverage for login")).toContain("test");
    });

    it("'vitest' keyword → test domain", () => {
      expect(domains("configure vitest for the package")).toContain("test");
    });

    it("'mock' keyword → test domain", () => {
      expect(domains("mock the stripe API in tests")).toContain("test");
    });
  });

  describe("title-prefix domain contributions", () => {
    it("chore(deps): prefix → adds dependency domain", () => {
      expect(domains("bump lodash", "chore(deps): ")).toContain("dependency");
    });

    it("fix(security): prefix → adds security domain", () => {
      expect(domains("patch CVE", "fix(security): ")).toContain("security");
    });

    it("docs: prefix → adds docs domain", () => {
      expect(domains("update README", "docs: ")).toContain("docs");
    });

    it("test: prefix → adds test domain", () => {
      expect(domains("add coverage", "test: ")).toContain("test");
    });

    it("chore(lint): prefix → no extra domain (lint-only signal)", () => {
      // chore(lint) is trivial but carries no domain
      const result = domains("fix lint warnings", "chore(lint): ");
      expect(result).not.toContain("dependency");
      expect(result).not.toContain("security");
    });
  });

  describe("multiple domains from one description", () => {
    it("description with both deploy and security keywords → both domains", () => {
      const result = domains("deploy auth service with security audit");
      expect(result).toContain("deploy");
      expect(result).toContain("security");
    });

    it("no matching keywords → empty domains array", () => {
      expect(domains("update the color scheme")).toHaveLength(0);
    });
  });
});

// ── Context bundle classification ─────────────────────────────────────

describe("classifyTask — contextBundles", () => {
  it("dependency domain → dependency-bump.md bundle", () => {
    expect(bundles("bump lodash to latest")).toContain(".agent/contexts/dependency-bump.md");
  });

  it("deploy domain → deploy-fixes.md bundle", () => {
    expect(bundles("deploy the marketing site")).toContain(".agent/contexts/deploy-fixes.md");
  });

  it("security domain → security-audit.md bundle", () => {
    expect(bundles("fix auth vulnerability")).toContain(".agent/contexts/security-audit.md");
  });

  it("test domain → testing-patterns.md bundle", () => {
    expect(bundles("write test coverage")).toContain(".agent/contexts/testing-patterns.md");
  });

  it("type/typescript keywords → type-safety.md bundle", () => {
    expect(bundles("fix TypeScript any types")).toContain(".agent/contexts/type-safety.md");
  });

  it("'type' keyword → type-safety.md bundle", () => {
    expect(bundles("resolve type inference issue")).toContain(".agent/contexts/type-safety.md");
  });

  it("'any' keyword → type-safety.md bundle", () => {
    expect(bundles("replace any with proper types")).toContain(".agent/contexts/type-safety.md");
  });

  it("description with no matching keywords → no bundles", () => {
    expect(bundles("update the homepage color scheme")).toHaveLength(0);
  });

  it("multiple domains → multiple bundles, deduplicated", () => {
    const result = bundles("deploy auth service with security audit");
    expect(result).toContain(".agent/contexts/deploy-fixes.md");
    expect(result).toContain(".agent/contexts/security-audit.md");
    // Deduplication — no repeats
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });
});

// ── Return shape ──────────────────────────────────────────────────────

describe("classifyTask — return shape", () => {
  it("returns a frozen object", () => {
    const result = classifyTask("update auth");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("domains array is frozen", () => {
    const result = classifyTask("update auth");
    expect(Object.isFrozen(result.domains)).toBe(true);
  });

  it("contextBundles array is frozen", () => {
    const result = classifyTask("update auth");
    expect(Object.isFrozen(result.contextBundles)).toBe(true);
  });

  it("always has tier, domains, contextBundles properties", () => {
    const result: TaskSignals = classifyTask("some task");
    expect(result).toHaveProperty("tier");
    expect(result).toHaveProperty("domains");
    expect(result).toHaveProperty("contextBundles");
  });

  it("is pure — same input returns same output", () => {
    const a = classifyTask("fix auth security issue");
    const b = classifyTask("fix auth security issue");
    expect(a.tier).toBe(b.tier);
    expect([...a.domains]).toEqual([...b.domains]);
    expect([...a.contextBundles]).toEqual([...b.contextBundles]);
  });

  it("titlePrefix is optional — omitting it does not throw", () => {
    expect(() => classifyTask("some task")).not.toThrow();
  });
});
