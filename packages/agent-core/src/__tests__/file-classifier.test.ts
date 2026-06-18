/**
 * Tests for the unified FileClassifier module.
 *
 * All file-type predicate assertions live here. Individual caller tests
 * (change-type-classifier, pr-risk-classifier, audit-inventory, model-router)
 * drop their own file-type fixture assertions and delegate to this module.
 */

import { describe, it, expect } from "vitest";
import {
  isTestFile,
  isDocFile,
  isConfigFile,
  isDependencyFile,
  isInfrastructureFile,
  isFrontendSourceFile,
  isBackendSourceFile,
  isLowRiskFile,
  isNonAuditableFile,
} from "../file-classifier.js";

// ── isTestFile ──────────────────────────────────────────────────────────────

describe("isTestFile", () => {
  it("matches .test.ts", () => {
    expect(isTestFile("src/routes.test.ts")).toBe(true);
  });

  it("matches .test.tsx", () => {
    expect(isTestFile("src/Button.test.tsx")).toBe(true);
  });

  it("matches .spec.ts", () => {
    expect(isTestFile("src/auth.spec.ts")).toBe(true);
  });

  it("matches .spec.tsx", () => {
    expect(isTestFile("src/Modal.spec.tsx")).toBe(true);
  });

  it("matches .test.js", () => {
    expect(isTestFile("utils/helpers.test.js")).toBe(true);
  });

  it("matches .spec.jsx", () => {
    expect(isTestFile("components/Card.spec.jsx")).toBe(true);
  });

  it("matches .test.mjs", () => {
    expect(isTestFile("lib/foo.test.mjs")).toBe(true);
  });

  it("matches .spec.cjs", () => {
    expect(isTestFile("lib/bar.spec.cjs")).toBe(true);
  });

  it("matches deeply nested test file", () => {
    expect(isTestFile("services/users/src/__tests__/users.test.ts")).toBe(true);
  });

  it("does not match plain .ts file", () => {
    expect(isTestFile("src/routes.ts")).toBe(false);
  });

  it("does not match .tsx component", () => {
    expect(isTestFile("src/components/Button.tsx")).toBe(false);
  });

  it("does not match a file with 'test' in directory name but not extension", () => {
    expect(isTestFile("src/__tests__/setup.ts")).toBe(false);
  });
});

// ── isDocFile ────────────────────────────────────────────────────────────────

describe("isDocFile", () => {
  it("matches root README.md", () => {
    expect(isDocFile("README.md")).toBe(true);
  });

  it("matches CHANGELOG.md", () => {
    expect(isDocFile("CHANGELOG.md")).toBe(true);
  });

  it("matches nested .md file", () => {
    expect(isDocFile("packages/rialto/CLAUDE.md")).toBe(true);
  });

  it("matches docs/ directory file with .md", () => {
    expect(isDocFile("docs/evaluations/2026-02-26-caching.md")).toBe(true);
  });

  it("matches docs/ file without .md extension", () => {
    expect(isDocFile("docs/adr/001-use-postgres")).toBe(true);
  });

  it("does not match a .ts source file", () => {
    expect(isDocFile("src/routes.ts")).toBe(false);
  });

  it("does not match a .yml file", () => {
    expect(isDocFile(".github/workflows/ci.yml")).toBe(false);
  });
});

// ── isConfigFile ─────────────────────────────────────────────────────────────

describe("isConfigFile", () => {
  it("matches .github/ workflow files", () => {
    expect(isConfigFile(".github/workflows/ci.yml")).toBe(true);
  });

  it("matches .claude/ skill files", () => {
    expect(isConfigFile(".claude/settings.json")).toBe(true);
  });

  it("matches turbo.json", () => {
    expect(isConfigFile("turbo.json")).toBe(true);
  });

  it("matches vite.config.ts", () => {
    expect(isConfigFile("apps/marketing/vite.config.ts")).toBe(true);
  });

  it("matches vitest.config.ts", () => {
    expect(isConfigFile("packages/agent-core/vitest.config.ts")).toBe(true);
  });

  it("matches eslint.config.js", () => {
    expect(isConfigFile("eslint.config.js")).toBe(true);
  });

  it("matches prettier.config.mjs", () => {
    expect(isConfigFile("prettier.config.mjs")).toBe(true);
  });

  it("does not match a plain .ts file", () => {
    expect(isConfigFile("src/routes.ts")).toBe(false);
  });

  it("does not match a regular JSON file", () => {
    expect(isConfigFile("src/data.json")).toBe(false);
  });
});

// ── isDependencyFile ──────────────────────────────────────────────────────────

describe("isDependencyFile", () => {
  it("matches root package.json", () => {
    expect(isDependencyFile("package.json")).toBe(true);
  });

  it("matches nested package.json", () => {
    expect(isDependencyFile("apps/marketing/package.json")).toBe(true);
  });

  it("matches pnpm-lock.yaml", () => {
    expect(isDependencyFile("pnpm-lock.yaml")).toBe(true);
  });

  it("matches package-lock.json", () => {
    expect(isDependencyFile("package-lock.json")).toBe(true);
  });

  it("matches yarn.lock", () => {
    expect(isDependencyFile("yarn.lock")).toBe(true);
  });

  it("does not match package.json.bak", () => {
    expect(isDependencyFile("package.json.bak")).toBe(false);
  });

  it("does not match a plain .ts file", () => {
    expect(isDependencyFile("src/index.ts")).toBe(false);
  });
});

// ── isInfrastructureFile ──────────────────────────────────────────────────────

describe("isInfrastructureFile", () => {
  it("matches infrastructure/ files", () => {
    expect(isInfrastructureFile("infrastructure/pulumi/index.ts")).toBe(true);
  });

  it("matches infrastructure/worker files", () => {
    expect(isInfrastructureFile("infrastructure/worker/src/router.ts")).toBe(true);
  });

  it("does not match .github/ files", () => {
    expect(isInfrastructureFile(".github/workflows/ci.yml")).toBe(false);
  });

  it("does not match services/ files", () => {
    expect(isInfrastructureFile("services/users/src/index.ts")).toBe(false);
  });
});

// ── isFrontendSourceFile ──────────────────────────────────────────────────────

describe("isFrontendSourceFile", () => {
  it("matches apps/ source files", () => {
    expect(isFrontendSourceFile("apps/marketing/src/App.tsx")).toBe(true);
  });

  it("matches packages/rialto/ source files", () => {
    expect(isFrontendSourceFile("packages/rialto/src/Button.tsx")).toBe(true);
  });

  it("does not match test files in apps/", () => {
    expect(isFrontendSourceFile("apps/marketing/src/App.test.tsx")).toBe(false);
  });

  it("does not match config files in apps/", () => {
    expect(isFrontendSourceFile("apps/marketing/vite.config.ts")).toBe(false);
  });

  it("does not match doc files in apps/", () => {
    expect(isFrontendSourceFile("apps/marketing/README.md")).toBe(false);
  });

  it("does not match services/ files", () => {
    expect(isFrontendSourceFile("services/users/src/index.ts")).toBe(false);
  });
});

// ── isBackendSourceFile ────────────────────────────────────────────────────────

describe("isBackendSourceFile", () => {
  it("matches services/ source files", () => {
    expect(isBackendSourceFile("services/users/src/routes/users.ts")).toBe(true);
  });

  it("does not match test files in services/", () => {
    expect(isBackendSourceFile("services/users/src/routes/users.test.ts")).toBe(false);
  });

  it("does not match doc files in services/", () => {
    expect(isBackendSourceFile("services/users/README.md")).toBe(false);
  });

  it("does not match config files in services/", () => {
    expect(isBackendSourceFile("services/users/vitest.config.ts")).toBe(false);
  });

  it("does not match apps/ files", () => {
    expect(isBackendSourceFile("apps/marketing/src/App.tsx")).toBe(false);
  });
});

// ── isLowRiskFile ─────────────────────────────────────────────────────────────

describe("isLowRiskFile", () => {
  it("returns true for test files", () => {
    expect(isLowRiskFile("src/routes.test.ts")).toBe(true);
  });

  it("returns true for doc files", () => {
    expect(isLowRiskFile("README.md")).toBe(true);
  });

  it("returns true for dependency files", () => {
    expect(isLowRiskFile("package.json")).toBe(true);
  });

  it("returns true for config files", () => {
    expect(isLowRiskFile(".github/workflows/ci.yml")).toBe(true);
  });

  it("returns false for regular source files", () => {
    expect(isLowRiskFile("src/routes.ts")).toBe(false);
  });

  it("returns false for React components", () => {
    expect(isLowRiskFile("src/components/Button.tsx")).toBe(false);
  });

  it("returns false for migration files", () => {
    expect(isLowRiskFile("prisma/migrations/20260101_add_users/migration.sql")).toBe(false);
  });
});

// ── isNonAuditableFile ────────────────────────────────────────────────────────

describe("isNonAuditableFile", () => {
  it("returns true for docs/ files", () => {
    expect(isNonAuditableFile("docs/evaluations/2026-02-26-caching.md")).toBe(true);
  });

  it("returns true for .md files", () => {
    expect(isNonAuditableFile("README.md")).toBe(true);
  });

  it("returns true for .github/ files", () => {
    expect(isNonAuditableFile(".github/workflows/ci.yml")).toBe(true);
  });

  it("returns true for .yaml files", () => {
    expect(isNonAuditableFile("docker-compose.yaml")).toBe(true);
  });

  it("returns true for .yml files", () => {
    expect(isNonAuditableFile("deployment.yml")).toBe(true);
  });

  it("returns true for .test.ts files", () => {
    expect(isNonAuditableFile("src/routes.test.ts")).toBe(true);
  });

  it("returns true for .test.tsx files", () => {
    expect(isNonAuditableFile("src/Button.test.tsx")).toBe(true);
  });

  it("returns true for .spec.ts files", () => {
    expect(isNonAuditableFile("src/auth.spec.ts")).toBe(true);
  });

  it("returns true for .claude/ files", () => {
    expect(isNonAuditableFile(".claude/settings.json")).toBe(true);
  });

  it("returns true for .gitignore", () => {
    expect(isNonAuditableFile(".gitignore")).toBe(true);
  });

  it("returns true for turbo.json", () => {
    expect(isNonAuditableFile("turbo.json")).toBe(true);
  });

  it("returns false for regular source files", () => {
    expect(isNonAuditableFile("src/routes.ts")).toBe(false);
  });

  it("returns false for React components", () => {
    expect(isNonAuditableFile("src/components/Button.tsx")).toBe(false);
  });

  it("returns false for migration SQL", () => {
    expect(isNonAuditableFile("prisma/migrations/20260101_add_users/migration.sql")).toBe(false);
  });
});
