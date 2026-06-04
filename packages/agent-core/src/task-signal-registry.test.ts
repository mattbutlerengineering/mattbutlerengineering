import { describe, it, expect } from "vitest";
import { classifyTask } from "./task-signal-registry.js";
import type { TaskDomain } from "./task-signal-registry.js";

describe("classifyTask", () => {
  // ── Tier classification (preserves budget-calculator behavior) ──────
  describe("tier", () => {
    it("returns 'complex' for complex-signaling descriptions", () => {
      expect(classifyTask("implement new feature").tier).toBe("complex");
      expect(classifyTask("architect the new microservice").tier).toBe("complex");
      expect(classifyTask("design the data model").tier).toBe("complex");
      expect(classifyTask("spin up a new service for billing").tier).toBe("complex");
      expect(classifyTask("write a migration for the schema").tier).toBe("complex");
      expect(classifyTask("feat: add export").tier).toBe("complex");
    });

    it("returns 'simple' for simple-signaling descriptions", () => {
      expect(classifyTask("fix lint errors").tier).toBe("simple");
      expect(classifyTask("bump lodash version").tier).toBe("simple");
      expect(classifyTask("fix a typo in the docs").tier).toBe("simple");
      expect(classifyTask("rename the helper function").tier).toBe("simple");
      expect(classifyTask("update dep versions").tier).toBe("simple");
      expect(classifyTask("fix import paths").tier).toBe("simple");
    });

    it("returns 'standard' for standard-signaling descriptions", () => {
      expect(classifyTask("fix the login bug").tier).toBe("standard");
      expect(classifyTask("add test for the parser").tier).toBe("standard");
      expect(classifyTask("update the dashboard logic").tier).toBe("standard");
      expect(classifyTask("ci-fix the flaky pipeline").tier).toBe("standard");
    });

    it("returns 'standard' for unmatched descriptions", () => {
      expect(classifyTask("random task").tier).toBe("standard");
    });

    // INTENTIONAL UNIFICATION: model-router OPUS_COMPLEXITY_KEYWORDS folded into
    // the complex tier. These were previously budget-`standard` but model-`opus`
    // (an inconsistency the registry resolves toward complex). See issue #1912.
    it("treats architecture-grade refactor/migration keywords as 'complex'", () => {
      expect(classifyTask("refactor the auth handler").tier).toBe("complex");
      expect(classifyTask("touches infrastructure config").tier).toBe("complex");
      expect(classifyTask("this is a breaking change").tier).toBe("complex");
      expect(classifyTask("requires a schema change").tier).toBe("complex");
    });

    it("prioritizes complex over simple when both signals present", () => {
      // "feat" (complex) + "rename" (simple) — complex wins
      expect(classifyTask("feat: rename old file to new system").tier).toBe("complex");
    });

    it("prioritizes complex over standard when both signals present", () => {
      // "implement" (complex) + "refactor" (standard) — complex wins
      expect(classifyTask("implement a refactor of the engine").tier).toBe("complex");
    });
  });

  // ── Domain classification (drives contextBundles) ───────────────────
  describe("domains", () => {
    const cases: Array<{ desc: string; domain: TaskDomain }> = [
      { desc: "bump dependency versions", domain: "dependency" },
      { desc: "upgrade the package", domain: "dependency" },
      { desc: "add vitest mocks for the module", domain: "test" },
      { desc: "fix security vulnerability in auth", domain: "security" },
      { desc: "fix the deploy pipeline with wrangler", domain: "deploy" },
      { desc: "deploy via doctl to digitalocean", domain: "deploy" },
    ];

    for (const { desc, domain } of cases) {
      it(`classifies "${desc}" with domain ${domain}`, () => {
        expect(classifyTask(desc).domains).toContain(domain);
      });
    }

    it("returns multiple domains when multiple categories match", () => {
      const domains = classifyTask("security audit of test coverage").domains;
      expect(domains).toContain("security");
      expect(domains).toContain("test");
    });

    it("returns empty domains for unmatched description", () => {
      expect(classifyTask("improve layout of the homepage").domains).toEqual([]);
    });

    it("returns unique domains (no duplicates)", () => {
      const domains = classifyTask("security audit").domains;
      expect(domains.filter((d) => d === "security").length).toBe(1);
    });
  });

  // ── Context bundles (preserves source-resolver behavior) ────────────
  describe("contextBundles", () => {
    it("returns security bundle for security keyword", () => {
      expect(classifyTask("Fix security vulnerability in auth").contextBundles).toContain(
        ".agent/contexts/security-audit.md"
      );
    });

    it("returns testing bundle for test keyword", () => {
      expect(classifyTask("Add vitest mocks for the new module").contextBundles).toContain(
        ".agent/contexts/testing-patterns.md"
      );
    });

    it("returns dependency bundle for bump keyword", () => {
      expect(classifyTask("bump dependency versions").contextBundles).toContain(
        ".agent/contexts/dependency-bump.md"
      );
    });

    it("returns deploy bundle for deploy keyword", () => {
      expect(classifyTask("fix the deploy pipeline").contextBundles).toContain(
        ".agent/contexts/deploy-fixes.md"
      );
    });

    it("returns type-safety bundle for typescript keyword", () => {
      expect(classifyTask("Fix typescript any types").contextBundles).toContain(
        ".agent/contexts/type-safety.md"
      );
    });

    it("returns audit (security) bundle for audit keyword", () => {
      expect(classifyTask("perform an audit of the codebase").contextBundles).toContain(
        ".agent/contexts/security-audit.md"
      );
    });

    it("returns empty bundles for unmatched description", () => {
      expect(classifyTask("Improve layout of the homepage").contextBundles).toEqual([]);
    });

    it("returns unique bundles (no duplicates)", () => {
      // 'audit' and 'security' both map to security-audit.md
      const bundles = classifyTask("security audit").contextBundles;
      expect(bundles.filter((b) => b === ".agent/contexts/security-audit.md").length).toBe(1);
    });

    it("returns multiple bundles when description matches multiple categories", () => {
      const bundles = classifyTask("security audit of test coverage").contextBundles;
      expect(bundles).toContain(".agent/contexts/security-audit.md");
      expect(bundles).toContain(".agent/contexts/testing-patterns.md");
    });
  });

  // ── titlePrefix routing hint (model-router HAIKU_TITLE_PATTERNS) ─────
  describe("titlePrefix lightweight signals", () => {
    it("marks chore(deps): titles as a dependency, trivial-tier signal", () => {
      const signals = classifyTask("bump lodash from 4 to 5", "chore(deps): bump lodash");
      expect(signals.tier).toBe("trivial");
      expect(signals.domains).toContain("dependency");
    });

    it("marks fix(security): titles as a security, trivial-tier signal", () => {
      const signals = classifyTask("patch the CVE", "fix(security): patch CVE-2024-1234");
      expect(signals.tier).toBe("trivial");
      expect(signals.domains).toContain("security");
    });

    it("marks docs: titles as a docs, trivial-tier signal", () => {
      const signals = classifyTask("update the readme", "docs: update README");
      expect(signals.tier).toBe("trivial");
      expect(signals.domains).toContain("docs");
    });

    it("marks test: titles as a test, trivial-tier signal", () => {
      const signals = classifyTask("add coverage", "test: add coverage for auth");
      expect(signals.tier).toBe("trivial");
      expect(signals.domains).toContain("test");
    });

    it("marks chore(lint): titles as trivial-tier", () => {
      const signals = classifyTask("fix violations", "chore(lint): fix ESLint violations");
      expect(signals.tier).toBe("trivial");
    });

    it("marks chore(style): titles as trivial-tier", () => {
      const signals = classifyTask("apply prettier", "chore(style): apply Prettier formatting");
      expect(signals.tier).toBe("trivial");
    });

    it("is case-insensitive for title prefixes", () => {
      expect(classifyTask("bump react", "CHORE(DEPS): bump react to 19").tier).toBe("trivial");
    });

    it("does not mark non-deps chore titles as trivial", () => {
      expect(classifyTask("update readme", "chore: update README").tier).not.toBe("trivial");
    });

    it("does not mark non-security fix titles as trivial", () => {
      expect(classifyTask("correct redirect", "fix: correct login redirect").tier).not.toBe(
        "trivial"
      );
    });

    it("returns purely description-derived signals when titlePrefix is omitted", () => {
      const signals = classifyTask("fix lint errors");
      expect(signals.tier).toBe("simple");
    });
  });

  // ── Immutability ────────────────────────────────────────────────────
  describe("immutability", () => {
    it("returns frozen readonly arrays", () => {
      const signals = classifyTask("security audit");
      expect(Object.isFrozen(signals)).toBe(true);
      expect(Object.isFrozen(signals.domains)).toBe(true);
      expect(Object.isFrozen(signals.contextBundles)).toBe(true);
    });
  });
});
