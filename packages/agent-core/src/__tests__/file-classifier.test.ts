/**
 * Tests for the unified FileClassifier module.
 * This is the single source of truth for file classification predicates.
 */

import { describe, it, expect } from "vitest";
import {
  isTestFile,
  isDocFile,
  isTestOrDocsPath,
  isConfigFile,
  isDependencyFile,
  isInfrastructureFile,
  isFrontendSourceFile,
  isBackendSourceFile,
  isAutomationDefinitionFile,
  isLowRiskFile,
  isNonAuditableFile,
} from "../file-classifier.js";

// ── isTestFile ──────────────────────────────────────────────────────────────

describe("isTestFile", () => {
  it("matches .test.ts", () => expect(isTestFile("src/routes.test.ts")).toBe(true));
  it("matches .spec.ts", () => expect(isTestFile("src/auth.spec.ts")).toBe(true));
  it("matches .test.tsx", () => expect(isTestFile("src/Button.test.tsx")).toBe(true));
  it("matches .spec.tsx", () => expect(isTestFile("src/Modal.spec.tsx")).toBe(true));
  it("matches .test.js", () => expect(isTestFile("utils/helpers.test.js")).toBe(true));
  it("matches .spec.jsx", () => expect(isTestFile("components/Card.spec.jsx")).toBe(true));
  it("matches .test.mjs", () => expect(isTestFile("src/util.test.mjs")).toBe(true));
  it("matches .test.cjs", () => expect(isTestFile("src/util.test.cjs")).toBe(true));
  it("does NOT match regular .ts", () => expect(isTestFile("src/routes.ts")).toBe(false));
  it("does NOT match .tsx", () => expect(isTestFile("src/Button.tsx")).toBe(false));
  it("does NOT match file containing 'test' in name", () =>
    expect(isTestFile("src/contest.ts")).toBe(false));
});

// ── isDocFile ───────────────────────────────────────────────────────────────

describe("isDocFile", () => {
  it("matches root .md", () => expect(isDocFile("README.md")).toBe(true));
  it("matches nested .md", () => expect(isDocFile("packages/rialto/CLAUDE.md")).toBe(true));
  it("matches CHANGELOG.md", () => expect(isDocFile("CHANGELOG.md")).toBe(true));
  it("matches docs/ prefix", () => expect(isDocFile("docs/evaluations/2026-02-26.md")).toBe(true));
  it("matches docs/ without .md", () => expect(isDocFile("docs/adr/001-use-postgres")).toBe(true));
  it("does NOT match .ts", () => expect(isDocFile("src/index.ts")).toBe(false));
  it("does NOT match regular file in non-docs dir", () =>
    expect(isDocFile("src/readme-builder.ts")).toBe(false));
});

// ── isConfigFile ────────────────────────────────────────────────────────────

describe("isConfigFile", () => {
  it("matches .github/ files", () => expect(isConfigFile(".github/workflows/ci.yml")).toBe(true));
  it("matches .claude/ files", () => expect(isConfigFile(".claude/settings.json")).toBe(true));
  it("matches turbo.json", () => expect(isConfigFile("turbo.json")).toBe(true));
  it("matches *.config.ts", () => expect(isConfigFile("apps/marketing/vite.config.ts")).toBe(true));
  it("matches *.config.js", () => expect(isConfigFile("eslint.config.js")).toBe(true));
  it("matches *.config.mjs", () => expect(isConfigFile("prettier.config.mjs")).toBe(true));
  it("matches *.config.cjs", () => expect(isConfigFile("jest.config.cjs")).toBe(true));
  it("does NOT match source .ts", () => expect(isConfigFile("src/routes.ts")).toBe(false));
  it("does NOT match package.json", () => expect(isConfigFile("package.json")).toBe(false));
});

// ── isDependencyFile ─────────────────────────────────────────────────────────

describe("isDependencyFile", () => {
  it("matches root package.json", () => expect(isDependencyFile("package.json")).toBe(true));
  it("matches nested package.json", () =>
    expect(isDependencyFile("apps/marketing/package.json")).toBe(true));
  it("matches pnpm-lock.yaml", () => expect(isDependencyFile("pnpm-lock.yaml")).toBe(true));
  it("matches package-lock.json", () => expect(isDependencyFile("package-lock.json")).toBe(true));
  it("matches yarn.lock", () => expect(isDependencyFile("yarn.lock")).toBe(true));
  it("matches pnpm-workspace.yaml", () =>
    expect(isDependencyFile("pnpm-workspace.yaml")).toBe(true));
  it("does NOT match package.json.bak", () =>
    expect(isDependencyFile("package.json.bak")).toBe(false));
  it("does NOT match source .ts", () => expect(isDependencyFile("src/index.ts")).toBe(false));
});

// ── isInfrastructureFile ────────────────────────────────────────────────────

describe("isInfrastructureFile", () => {
  it("matches infrastructure/ files", () =>
    expect(isInfrastructureFile("infrastructure/pulumi/index.ts")).toBe(true));
  it("matches infrastructure/migrate/", () =>
    expect(isInfrastructureFile("infrastructure/migrate/Dockerfile")).toBe(true));
  it("does NOT match apps/", () =>
    expect(isInfrastructureFile("apps/marketing/src/App.tsx")).toBe(false));
  it("does NOT match services/", () =>
    expect(isInfrastructureFile("services/users/src/index.ts")).toBe(false));
});

// ── isFrontendSourceFile ────────────────────────────────────────────────────

describe("isFrontendSourceFile", () => {
  it("matches apps/ source files", () =>
    expect(isFrontendSourceFile("apps/marketing/src/App.tsx")).toBe(true));
  it("matches packages/rialto/ source files", () =>
    expect(isFrontendSourceFile("packages/rialto/src/Button.tsx")).toBe(true));
  it("does NOT match test files in apps/", () =>
    expect(isFrontendSourceFile("apps/marketing/src/App.test.tsx")).toBe(false));
  it("does NOT match docs in apps/", () =>
    expect(isFrontendSourceFile("apps/marketing/README.md")).toBe(false));
  it("does NOT match config in apps/", () =>
    expect(isFrontendSourceFile("apps/marketing/vite.config.ts")).toBe(false));
  it("does NOT match services/", () =>
    expect(isFrontendSourceFile("services/users/src/routes.ts")).toBe(false));
});

// ── isBackendSourceFile ─────────────────────────────────────────────────────

describe("isBackendSourceFile", () => {
  it("matches services/ source files", () =>
    expect(isBackendSourceFile("services/users/src/routes.ts")).toBe(true));
  it("does NOT match test files in services/", () =>
    expect(isBackendSourceFile("services/users/src/routes.test.ts")).toBe(false));
  it("does NOT match docs in services/", () =>
    expect(isBackendSourceFile("services/users/README.md")).toBe(false));
  it("does NOT match config in services/", () =>
    expect(isBackendSourceFile("services/users/vite.config.ts")).toBe(false));
  it("does NOT match apps/", () =>
    expect(isBackendSourceFile("apps/marketing/src/App.tsx")).toBe(false));
});

// ── isAutomationDefinitionFile ───────────────────────────────────────────────
// #3971: executable CI/agent/skill definitions must never be low-risk, even
// though they live under the same .github/ and .claude/ prefixes that
// isConfigFile (correctly) treats as low-risk editor/repo config.

describe("isAutomationDefinitionFile", () => {
  it("matches a GitHub Actions workflow file", () =>
    expect(isAutomationDefinitionFile(".github/workflows/ci.yml")).toBe(true));
  it("matches any workflow file, not just ci.yml", () =>
    expect(isAutomationDefinitionFile(".github/workflows/deploy-static.yml")).toBe(true));
  it("matches a Claude agent definition", () =>
    expect(isAutomationDefinitionFile(".claude/agents/reviewer.md")).toBe(true));
  it("matches a Claude skill definition (SKILL.md, despite .md extension)", () =>
    expect(isAutomationDefinitionFile(".claude/skills/implement-queue/SKILL.md")).toBe(true));
  it("matches a Claude hook script", () =>
    expect(isAutomationDefinitionFile(".claude/hooks/secret-scan.mjs")).toBe(true));
  it("does NOT match a non-workflow .github/ file", () =>
    expect(isAutomationDefinitionFile(".github/CODEOWNERS")).toBe(false));
  it("does NOT match a plain-docs .claude/rules/ file", () =>
    expect(isAutomationDefinitionFile(".claude/rules/gotchas.md")).toBe(false));
  it("does NOT match .claude/settings.json", () =>
    expect(isAutomationDefinitionFile(".claude/settings.json")).toBe(false));
  it("does NOT match turbo.json", () =>
    expect(isAutomationDefinitionFile("turbo.json")).toBe(false));
  it("does NOT match source .ts", () =>
    expect(isAutomationDefinitionFile("src/routes.ts")).toBe(false));
});

// ── isLowRiskFile ───────────────────────────────────────────────────────────

describe("isLowRiskFile", () => {
  it("returns true for test files", () => expect(isLowRiskFile("src/routes.test.ts")).toBe(true));
  it("returns true for docs", () => expect(isLowRiskFile("README.md")).toBe(true));
  it("returns true for config files", () => expect(isLowRiskFile("turbo.json")).toBe(true));
  it("returns true for dependency manifests", () =>
    expect(isLowRiskFile("pnpm-lock.yaml")).toBe(true));
  it("returns false for source .ts", () => expect(isLowRiskFile("src/index.ts")).toBe(false));
  it("returns false for a React component", () =>
    expect(isLowRiskFile("src/components/Button.tsx")).toBe(false));
  it("returns false for a shell script", () =>
    expect(isLowRiskFile("scripts/deploy.sh")).toBe(false));
  it("returns false for a Dockerfile", () => expect(isLowRiskFile("Dockerfile")).toBe(false));
  it("returns true for a metrics telemetry file", () =>
    expect(isLowRiskFile("metrics/queue-telemetry.jsonl")).toBe(true));
  it("returns true for a nested metrics file", () =>
    expect(isLowRiskFile("metrics/production-health/2026-08-06.jsonl")).toBe(true));
  // #3971: automation definitions are config-shaped but must never be low-risk.
  it("returns false for a GitHub Actions workflow file (#3971)", () =>
    expect(isLowRiskFile(".github/workflows/ci.yml")).toBe(false));
  it("returns false for a Claude skill definition (#3971)", () =>
    expect(isLowRiskFile(".claude/skills/implement-queue/SKILL.md")).toBe(false));
  it("returns false for a Claude agent definition (#3971)", () =>
    expect(isLowRiskFile(".claude/agents/reviewer.md")).toBe(false));
  it("returns false for a Claude hook script (#3971)", () =>
    expect(isLowRiskFile(".claude/hooks/secret-scan.mjs")).toBe(false));
  it("returns true for plain docs under .claude/rules/ (#3971)", () =>
    expect(isLowRiskFile(".claude/rules/gotchas.md")).toBe(true));
});

// ── isNonAuditableFile ──────────────────────────────────────────────────────

describe("isNonAuditableFile", () => {
  it("returns true for docs/ files", () =>
    expect(isNonAuditableFile("docs/architecture/dep.md")).toBe(true));
  it("returns true for .md files", () => expect(isNonAuditableFile("README.md")).toBe(true));
  it("returns true for .github/ files", () =>
    expect(isNonAuditableFile(".github/workflows/ci.yml")).toBe(true));
  it("returns true for .claude/ files", () =>
    expect(isNonAuditableFile(".claude/settings.json")).toBe(true));
  it("returns true for test files", () =>
    expect(isNonAuditableFile("src/routes.test.ts")).toBe(true));
  it("returns true for turbo.json", () => expect(isNonAuditableFile("turbo.json")).toBe(true));
  it("returns true for any .yml file (broad YAML pattern)", () =>
    expect(isNonAuditableFile("some-config.yaml")).toBe(true));
  it("returns true for .yaml extension", () =>
    expect(isNonAuditableFile("docker-compose.yaml")).toBe(true));
  it("returns true for .gitignore", () => expect(isNonAuditableFile(".gitignore")).toBe(true));
  // Dependency manifests are NOT non-auditable: a dep update can affect the deployed app
  it("returns false for package.json", () =>
    expect(isNonAuditableFile("package.json")).toBe(false));
  it("returns false for nested package.json", () =>
    expect(isNonAuditableFile("apps/marketing/package.json")).toBe(false));
  it("returns false for source .ts", () => expect(isNonAuditableFile("src/index.ts")).toBe(false));
  it("returns false for React component", () =>
    expect(isNonAuditableFile("src/Button.tsx")).toBe(false));
  it("returns false for services source", () =>
    expect(isNonAuditableFile("services/users/src/routes.ts")).toBe(false));
});

describe("isTestOrDocsPath (test/docs context — broader than isTestFile||isDocFile)", () => {
  // Directory-context membership: NOT matched by isTestFile, but IS a test/docs context.
  it("matches a non-test file inside __tests__/", () =>
    expect(isTestOrDocsPath("src/__tests__/fake-deps.ts")).toBe(true));
  it("matches a helper inside a tests/ directory", () =>
    expect(isTestOrDocsPath("src/tests/helper.ts")).toBe(true));
  it("matches a source file under a docs/ directory mid-path", () =>
    expect(isTestOrDocsPath("packages/pkg/docs/api.ts")).toBe(true));
  it("matches CHANGELOG with no extension", () => expect(isTestOrDocsPath("CHANGELOG")).toBe(true));
  it("matches README anywhere", () => expect(isTestOrDocsPath("README.txt")).toBe(true));
  // Suffix/extension cases also covered.
  it("matches .test.ts files", () => expect(isTestOrDocsPath("src/routes.test.ts")).toBe(true));
  it("matches .spec.tsx files", () => expect(isTestOrDocsPath("src/App.spec.tsx")).toBe(true));
  it("matches .md files", () => expect(isTestOrDocsPath("notes.md")).toBe(true));
  // Plain source is NOT a test/docs context.
  it("returns false for plain source", () => expect(isTestOrDocsPath("src/index.ts")).toBe(false));
  it("returns false for a component", () => expect(isTestOrDocsPath("src/Button.tsx")).toBe(false));
});
