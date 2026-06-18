import { describe, it, expect } from "vitest";
import {
  classifyChanges,
  isLowRiskPR,
  shouldSkipPhase,
  formatClassification,
} from "../change-type-classifier.js";
import type { ChangeClassification } from "../change-type-classifier.js";

// ── Pure dependency changes ─────────────────────────────────────────────────

describe("classifyChanges — dependency", () => {
  it("classifies package.json only as dependency", () => {
    const result = classifyChanges(["package.json"]);
    expect(result.type).toBe("dependency");
    expect(result.files).toEqual(["package.json"]);
  });

  it("classifies pnpm-lock.yaml as dependency", () => {
    const result = classifyChanges(["pnpm-lock.yaml"]);
    expect(result.type).toBe("dependency");
  });

  it("classifies package.json + lockfile as dependency", () => {
    const result = classifyChanges(["package.json", "pnpm-lock.yaml"]);
    expect(result.type).toBe("dependency");
  });

  it("classifies nested package.json as dependency", () => {
    const result = classifyChanges(["apps/marketing/package.json"]);
    expect(result.type).toBe("dependency");
  });

  it("classifies yarn.lock as dependency", () => {
    const result = classifyChanges(["yarn.lock"]);
    expect(result.type).toBe("dependency");
  });

  it("skips smoke-audit, lighthouse, and e2e for dependency changes", () => {
    const result = classifyChanges(["package.json", "pnpm-lock.yaml"]);
    expect(result.skipPhases).toContain("smoke-audit");
    expect(result.skipPhases).toContain("lighthouse");
    expect(result.skipPhases).toContain("e2e");
    expect(result.skipPhases).not.toContain("deploy-verify");
  });
});

// ── Pure docs changes ───────────────────────────────────────────────────────

describe("classifyChanges — docs", () => {
  it("classifies README.md as docs", () => {
    const result = classifyChanges(["README.md"]);
    expect(result.type).toBe("docs");
  });

  it("classifies docs/ directory files as docs", () => {
    const result = classifyChanges(["docs/evaluations/2026-02-26-caching.md"]);
    expect(result.type).toBe("docs");
  });

  it("classifies nested markdown as docs", () => {
    const result = classifyChanges(["packages/rialto/CLAUDE.md"]);
    expect(result.type).toBe("docs");
  });

  it("skips all phases for docs changes", () => {
    const result = classifyChanges(["README.md"]);
    expect(result.skipPhases).toContain("deploy-verify");
    expect(result.skipPhases).toContain("smoke-audit");
    expect(result.skipPhases).toContain("lighthouse");
    expect(result.skipPhases).toContain("e2e");
  });
});

// ── Pure config changes ─────────────────────────────────────────────────────

describe("classifyChanges — config", () => {
  it("classifies .github/workflows/ci.yml as config", () => {
    const result = classifyChanges([".github/workflows/ci.yml"]);
    expect(result.type).toBe("config");
  });

  it("classifies .claude/ files as config", () => {
    const result = classifyChanges([".claude/settings.json"]);
    expect(result.type).toBe("config");
  });

  it("classifies turbo.json as config", () => {
    const result = classifyChanges(["turbo.json"]);
    expect(result.type).toBe("config");
  });

  it("classifies vite.config.ts as config", () => {
    const result = classifyChanges(["apps/marketing/vite.config.ts"]);
    expect(result.type).toBe("config");
  });

  it("classifies eslint.config.js as config", () => {
    const result = classifyChanges(["eslint.config.js"]);
    expect(result.type).toBe("config");
  });

  it("skips smoke-audit, lighthouse, and e2e for config changes", () => {
    const result = classifyChanges(["turbo.json"]);
    expect(result.skipPhases).toContain("smoke-audit");
    expect(result.skipPhases).toContain("lighthouse");
    expect(result.skipPhases).toContain("e2e");
    expect(result.skipPhases).not.toContain("deploy-verify");
  });
});

// ── Pure test changes ───────────────────────────────────────────────────────

describe("classifyChanges — test", () => {
  it("classifies .test.ts files as test", () => {
    const result = classifyChanges(["src/routes.test.ts"]);
    expect(result.type).toBe("test");
  });

  it("classifies .spec.ts files as test", () => {
    const result = classifyChanges(["src/auth.spec.ts"]);
    expect(result.type).toBe("test");
  });

  it("classifies multiple test files as test", () => {
    const result = classifyChanges([
      "src/routes.test.ts",
      "src/utils.spec.ts",
      "src/Button.test.tsx",
    ]);
    expect(result.type).toBe("test");
  });

  it("skips deploy-verify, lighthouse, and e2e for test changes", () => {
    const result = classifyChanges(["src/routes.test.ts"]);
    expect(result.skipPhases).toContain("deploy-verify");
    expect(result.skipPhases).toContain("lighthouse");
    expect(result.skipPhases).toContain("e2e");
    expect(result.skipPhases).not.toContain("smoke-audit");
  });
});

// ── Infrastructure changes ──────────────────────────────────────────────────

describe("classifyChanges — infrastructure", () => {
  it("classifies infrastructure/ files as infrastructure", () => {
    const result = classifyChanges(["infrastructure/pulumi/index.ts"]);
    expect(result.type).toBe("infrastructure");
  });

  it("classifies .github/workflows/ as infrastructure", () => {
    // Note: .github/workflows/ matches both config and infrastructure rules.
    // config is checked first in priority order, so this should be config.
    // However, if ONLY .github/workflows files are present, config wins.
    const result = classifyChanges([".github/workflows/deploy-static.yml"]);
    // .github/** matches config first
    expect(result.type).toBe("config");
  });

  it("classifies infrastructure/pulumi as infrastructure", () => {
    const result = classifyChanges(["infrastructure/pulumi/index.ts"]);
    expect(result.type).toBe("infrastructure");
    expect(result.skipPhases).toContain("smoke-audit");
    expect(result.skipPhases).toContain("lighthouse");
    expect(result.skipPhases).toContain("e2e");
  });
});

// ── Frontend changes ────────────────────────────────────────────────────────

describe("classifyChanges — frontend", () => {
  it("classifies apps/ source files as frontend", () => {
    const result = classifyChanges(["apps/marketing/src/App.tsx"]);
    expect(result.type).toBe("frontend");
  });

  it("classifies packages/rialto/ files as frontend", () => {
    const result = classifyChanges(["packages/rialto/src/Button.tsx"]);
    expect(result.type).toBe("frontend");
  });

  it("has no skip phases for frontend changes", () => {
    const result = classifyChanges(["apps/marketing/src/App.tsx"]);
    expect(result.skipPhases).toEqual([]);
  });

  it("classifies test files in apps/ as test, not frontend", () => {
    const result = classifyChanges(["apps/marketing/src/App.test.tsx"]);
    expect(result.type).toBe("test");
  });

  it("classifies config files in apps/ as config, not frontend", () => {
    const result = classifyChanges(["apps/marketing/vite.config.ts"]);
    expect(result.type).toBe("config");
  });

  it("classifies md files in apps/ as docs, not frontend", () => {
    const result = classifyChanges(["apps/marketing/README.md"]);
    expect(result.type).toBe("docs");
  });
});

// ── Backend changes ─────────────────────────────────────────────────────────

describe("classifyChanges — backend", () => {
  it("classifies services/ source files as backend", () => {
    const result = classifyChanges(["services/users/src/routes/users.ts"]);
    expect(result.type).toBe("backend");
  });

  it("skips only lighthouse for backend changes", () => {
    const result = classifyChanges(["services/users/src/routes/users.ts"]);
    expect(result.skipPhases).toEqual(["lighthouse"]);
  });

  it("classifies test files in services/ as test, not backend", () => {
    const result = classifyChanges(["services/users/src/routes/users.test.ts"]);
    expect(result.type).toBe("test");
  });
});

// ── Mixed changes ───────────────────────────────────────────────────────────

describe("classifyChanges — mixed", () => {
  it("returns mixed for frontend + backend", () => {
    const result = classifyChanges([
      "apps/marketing/src/App.tsx",
      "services/users/src/routes/users.ts",
    ]);
    expect(result.type).toBe("mixed");
  });

  it("has no skip phases for mixed changes", () => {
    const result = classifyChanges([
      "apps/marketing/src/App.tsx",
      "services/users/src/routes/users.ts",
    ]);
    expect(result.skipPhases).toEqual([]);
  });

  it("returns mixed for dependency + source changes", () => {
    const result = classifyChanges(["package.json", "src/index.ts"]);
    expect(result.type).toBe("mixed");
  });
});

// ── Empty file list ─────────────────────────────────────────────────────────

describe("classifyChanges — empty", () => {
  it("returns mixed with no skips for empty file list", () => {
    const result = classifyChanges([]);
    expect(result.type).toBe("mixed");
    expect(result.skipPhases).toEqual([]);
    expect(result.files).toEqual([]);
  });
});

// ── shouldSkipPhase ─────────────────────────────────────────────────────────

describe("shouldSkipPhase", () => {
  it("returns true when phase is in skipPhases", () => {
    const classification: ChangeClassification = {
      type: "dependency",
      files: ["package.json"],
      skipPhases: ["smoke-audit", "lighthouse", "e2e"],
      reason: "dependency change (1 file)",
    };
    expect(shouldSkipPhase(classification, "smoke-audit")).toBe(true);
    expect(shouldSkipPhase(classification, "lighthouse")).toBe(true);
    expect(shouldSkipPhase(classification, "e2e")).toBe(true);
  });

  it("returns false when phase is not in skipPhases", () => {
    const classification: ChangeClassification = {
      type: "dependency",
      files: ["package.json"],
      skipPhases: ["smoke-audit", "lighthouse", "e2e"],
      reason: "dependency change (1 file)",
    };
    expect(shouldSkipPhase(classification, "deploy-verify")).toBe(false);
  });

  it("returns false for mixed with no skip phases", () => {
    const classification: ChangeClassification = {
      type: "mixed",
      files: ["src/App.tsx", "services/users/src/index.ts"],
      skipPhases: [],
      reason: "mixed change (2 files)",
    };
    expect(shouldSkipPhase(classification, "smoke-audit")).toBe(false);
    expect(shouldSkipPhase(classification, "deploy-verify")).toBe(false);
    expect(shouldSkipPhase(classification, "lighthouse")).toBe(false);
    expect(shouldSkipPhase(classification, "e2e")).toBe(false);
  });
});

// ── formatClassification ────────────────────────────────────────────────────

describe("formatClassification", () => {
  it("formats dependency classification with skips", () => {
    const classification = classifyChanges(["package.json", "pnpm-lock.yaml"]);
    const output = formatClassification(classification);
    expect(output).toContain("dependency");
    expect(output).toContain("2 files");
    expect(output).toContain("skipping:");
  });

  it("formats frontend classification with no skips", () => {
    const classification = classifyChanges(["apps/marketing/src/App.tsx"]);
    const output = formatClassification(classification);
    expect(output).toContain("frontend");
    expect(output).toContain("1 file");
    expect(output).not.toContain("skipping:");
  });

  it("formats mixed classification", () => {
    const classification = classifyChanges([
      "apps/marketing/src/App.tsx",
      "services/users/src/routes/users.ts",
    ]);
    const output = formatClassification(classification);
    expect(output).toContain("mixed");
  });
});

// ── isLowRiskPR ─────────────────────────────────────────────────────────────

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
    expect(isLowRiskPR(["src/routes.test.ts", "src/utils.spec.ts", "src/Button.test.tsx"])).toBe(
      true
    );
  });

  it("returns true for deeply nested test file", () => {
    expect(isLowRiskPR(["services/users/src/__tests__/users.test.ts"])).toBe(true);
  });
});

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

describe("isLowRiskPR — infrastructure files", () => {
  it("returns true for infrastructure/ files", () => {
    expect(isLowRiskPR(["infrastructure/pulumi/index.ts"])).toBe(true);
  });
});

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

describe("isLowRiskPR — edge cases", () => {
  it("returns false for an empty file list", () => {
    expect(isLowRiskPR([])).toBe(false);
  });

  it("is not confused by a file named 'package.json.bak'", () => {
    expect(isLowRiskPR(["package.json.bak"])).toBe(false);
  });
});
