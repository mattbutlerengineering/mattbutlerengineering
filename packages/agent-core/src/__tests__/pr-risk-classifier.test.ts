import { describe, it, expect } from "vitest";
import { isLowRiskPR } from "../pr-risk-classifier.js";

// ── Test files ──────────────────────────────────────────────────────────────

describe("isLowRiskPR — test files", () => {
  it("returns true for a single .test.ts file", () => {
    expect(isLowRiskPR(["src/routes.test.ts"])).toBe(true);
  });

  it("returns true for a .test.tsx file", () => {
    expect(isLowRiskPR(["src/Button.test.tsx"])).toBe(true);
  });

  it("returns true for a .spec.ts file", () => {
    expect(isLowRiskPR(["src/auth.spec.ts"])).toBe(true);
  });

  it("returns true for a .spec.tsx file", () => {
    expect(isLowRiskPR(["src/Modal.spec.tsx"])).toBe(true);
  });

  it("returns true for a .test.js file", () => {
    expect(isLowRiskPR(["utils/helpers.test.js"])).toBe(true);
  });

  it("returns true for a .spec.jsx file", () => {
    expect(isLowRiskPR(["components/Card.spec.jsx"])).toBe(true);
  });

  it("returns true for multiple test files", () => {
    expect(
      isLowRiskPR(["src/routes.test.ts", "src/utils.spec.ts", "src/Button.test.tsx"])
    ).toBe(true);
  });
});

// ── Documentation ───────────────────────────────────────────────────────────

describe("isLowRiskPR — documentation", () => {
  it("returns true for a root .md file", () => {
    expect(isLowRiskPR(["README.md"])).toBe(true);
  });

  it("returns true for a CHANGELOG.md", () => {
    expect(isLowRiskPR(["CHANGELOG.md"])).toBe(true);
  });

  it("returns true for a nested .md file", () => {
    expect(isLowRiskPR(["packages/rialto/CLAUDE.md"])).toBe(true);
  });

  it("returns true for a file under docs/", () => {
    expect(isLowRiskPR(["docs/evaluations/2026-02-26-caching.md"])).toBe(true);
  });

  it("returns true for a docs/ file without .md extension", () => {
    expect(isLowRiskPR(["docs/adr/001-use-postgres"])).toBe(true);
  });
});

// ── Dependency manifests ─────────────────────────────────────────────────────

describe("isLowRiskPR — dependency manifests", () => {
  it("returns true for root package.json", () => {
    expect(isLowRiskPR(["package.json"])).toBe(true);
  });

  it("returns true for a nested package.json", () => {
    expect(isLowRiskPR(["apps/marketing/package.json"])).toBe(true);
  });

  it("returns true for pnpm-lock.yaml", () => {
    expect(isLowRiskPR(["pnpm-lock.yaml"])).toBe(true);
  });

  it("returns true for package-lock.json", () => {
    expect(isLowRiskPR(["package-lock.json"])).toBe(true);
  });

  it("returns true for yarn.lock", () => {
    expect(isLowRiskPR(["yarn.lock"])).toBe(true);
  });

  it("returns true for a combined package.json + lockfile bump", () => {
    expect(isLowRiskPR(["package.json", "pnpm-lock.yaml"])).toBe(true);
  });
});

// ── Config files ─────────────────────────────────────────────────────────────

describe("isLowRiskPR — config files", () => {
  it("returns true for a .github/ workflow file", () => {
    expect(isLowRiskPR([".github/workflows/deploy-static.yml"])).toBe(true);
  });

  it("returns true for a .claude/ skill file", () => {
    expect(isLowRiskPR([".claude/skills/ship-loop/SKILL.md"])).toBe(true);
  });

  it("returns true for turbo.json", () => {
    expect(isLowRiskPR(["turbo.json"])).toBe(true);
  });

  it("returns true for vite.config.ts", () => {
    expect(isLowRiskPR(["apps/marketing/vite.config.ts"])).toBe(true);
  });

  it("returns true for vitest.config.ts", () => {
    expect(isLowRiskPR(["packages/agent-core/vitest.config.ts"])).toBe(true);
  });

  it("returns true for eslint.config.js", () => {
    expect(isLowRiskPR(["eslint.config.js"])).toBe(true);
  });

  it("returns true for prettier.config.mjs", () => {
    expect(isLowRiskPR(["prettier.config.mjs"])).toBe(true);
  });
});

// ── Mixed / multi-category batches ───────────────────────────────────────────

describe("isLowRiskPR — mixed low-risk files", () => {
  it("returns true when combining docs, tests, and config changes", () => {
    expect(
      isLowRiskPR([
        "README.md",
        "src/utils.test.ts",
        ".github/workflows/ci.yml",
        "package.json",
        "pnpm-lock.yaml",
      ])
    ).toBe(true);
  });
});

// ── High-risk files ──────────────────────────────────────────────────────────

describe("isLowRiskPR — high-risk files", () => {
  it("returns false for a regular source file", () => {
    expect(isLowRiskPR(["src/routes.ts"])).toBe(false);
  });

  it("returns false for a React component", () => {
    expect(isLowRiskPR(["src/components/Button.tsx"])).toBe(false);
  });

  it("returns false for a migration file", () => {
    expect(isLowRiskPR(["prisma/migrations/20260101_add_users/migration.sql"])).toBe(false);
  });

  it("returns false when mix contains one high-risk file", () => {
    expect(isLowRiskPR(["src/routes.test.ts", "src/routes.ts"])).toBe(false);
  });

  it("returns false when mix of docs and source", () => {
    expect(isLowRiskPR(["README.md", "src/index.ts"])).toBe(false);
  });

  it("returns false for a shell script", () => {
    expect(isLowRiskPR(["scripts/deploy.sh"])).toBe(false);
  });

  it("returns false for a Dockerfile", () => {
    expect(isLowRiskPR(["Dockerfile"])).toBe(false);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("isLowRiskPR — edge cases", () => {
  it("returns false for an empty file list", () => {
    expect(isLowRiskPR([])).toBe(false);
  });

  it("is not confused by a file named 'package.json.bak'", () => {
    // Does not match the exact name or /package.json suffix rule correctly
    // package.json.bak ends with .bak, not /package.json — should be false
    expect(isLowRiskPR(["package.json.bak"])).toBe(false);
  });

  it("returns true for deeply nested test file", () => {
    expect(isLowRiskPR(["services/users/src/__tests__/users.test.ts"])).toBe(true);
  });
});
