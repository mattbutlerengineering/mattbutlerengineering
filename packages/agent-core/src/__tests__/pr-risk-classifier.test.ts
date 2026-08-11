import { describe, it, expect } from "vitest";
import { isLowRiskPR, qualifiesForLowRiskFastPath } from "../pr-risk-classifier.js";

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
    expect(isLowRiskPR(["src/routes.test.ts", "src/utils.spec.ts", "src/Button.test.tsx"])).toBe(
      true
    );
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

  it("returns true for a pure catalog-version bump (pnpm-lock.yaml + pnpm-workspace.yaml, no package.json)", () => {
    expect(isLowRiskPR(["pnpm-lock.yaml", "pnpm-workspace.yaml"])).toBe(true);
  });
});

// ── Config files ─────────────────────────────────────────────────────────────

describe("isLowRiskPR — config files", () => {
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
        "turbo.json",
        "package.json",
        "pnpm-lock.yaml",
      ])
    ).toBe(true);
  });

  // #3971: an otherwise-low-risk batch must still fall through to review if
  // it also touches a workflow file.
  it("returns false when an otherwise low-risk batch also touches a workflow file", () => {
    expect(isLowRiskPR(["README.md", "src/utils.test.ts", ".github/workflows/ci.yml"])).toBe(false);
  });
});

// ── Automation definition files (#3971) ──────────────────────────────────────
// isLowRiskPR must never skip review for a PR that touches the executable
// definitions of the review/merge gate itself — GitHub Actions workflows,
// Claude agent/skill definitions, or hook scripts — even though those paths
// also match the low-risk .github/.claude config allowlist.

describe("isLowRiskPR — automation definition files", () => {
  it("returns false for a GitHub Actions workflow file", () => {
    expect(isLowRiskPR([".github/workflows/ci.yml"])).toBe(false);
  });

  it("returns false for any workflow file, not just ci.yml", () => {
    expect(isLowRiskPR([".github/workflows/deploy-static.yml"])).toBe(false);
  });

  it("returns false for a Claude skill definition", () => {
    expect(isLowRiskPR([".claude/skills/implement-queue/SKILL.md"])).toBe(false);
  });

  it("returns false for a Claude agent definition", () => {
    expect(isLowRiskPR([".claude/agents/reviewer.md"])).toBe(false);
  });

  it("returns false for a Claude hook script", () => {
    expect(isLowRiskPR([".claude/hooks/secret-scan.mjs"])).toBe(false);
  });

  it("returns true for plain docs under .claude/rules/ (docs stay low-risk)", () => {
    expect(isLowRiskPR([".claude/rules/gotchas.md"])).toBe(true);
  });

  it("returns false for PR #3970's exact file list", () => {
    expect(
      isLowRiskPR([
        ".claude/rules/gotchas.md",
        ".github/workflows/rialto-web-e2e.yml",
        ".github/workflows/rialto-web-visual.yml",
        "apps/rialto-web/e2e/interaction.spec.ts",
        "apps/rialto-web/e2e/navigation.spec.ts",
        "apps/rialto-web/e2e/search.spec.ts",
        "apps/rialto-web/e2e/theme.spec.ts",
        "apps/rialto-web/e2e/workflow-coverage.test.ts",
        "apps/rialto-web/vitest.config.ts",
      ])
    ).toBe(false);
  });

  it("returns false for the degenerate single-file case", () => {
    expect(isLowRiskPR([".github/workflows/ci.yml"])).toBe(false);
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

// ── Metrics telemetry ────────────────────────────────────────────────────────
// Motivated by #3887: SKILL.md claimed queue-telemetry PRs auto-merge via the
// low-risk fast path, but metrics/** was never in the allowlist. These are the
// exact PRs that surfaced the drift (#3885 must still fall through to review
// because of the publicly-served marketing JSON file it also touches).

describe("isLowRiskPR — metrics telemetry", () => {
  it("returns true for a queue-telemetry.jsonl-only PR", () => {
    expect(isLowRiskPR(["metrics/queue-telemetry.jsonl"])).toBe(true);
  });

  it("returns true for a dated production-health metrics file", () => {
    expect(isLowRiskPR(["metrics/production-health/2026-08-06.jsonl"])).toBe(true);
  });

  it("returns false for PR #3885's mixed diff (metrics + publicly-served marketing JSON)", () => {
    expect(
      isLowRiskPR([
        ".claude/improvement-loop/log.md",
        "metrics/sensor-report.jsonl",
        "apps/marketing/public/sensor-report.json",
      ])
    ).toBe(false);
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

// ── qualifiesForLowRiskFastPath ─────────────────────────────────────────────
// Motivated by #4063: isLowRiskPR and reviewersForDiff are independent
// functions over the same file list and can both fire — the fast path must
// require BOTH isLowRiskPR AND an empty reviewersForDiff result, or it
// silently drops a diff-matched specialist (e.g. dependency-update-reviewer
// on a pure package.json/pnpm-lock.yaml/pnpm-workspace.yaml bump).

describe("qualifiesForLowRiskFastPath", () => {
  // Exact 20 changed paths from PR #4058 (`gh pr diff 4058 --name-only`) — a
  // production-deps bump that is isLowRiskPR === true (every file is a
  // package.json/pnpm-lock.yaml/pnpm-workspace.yaml) but also matches
  // dependency-update-reviewer via reviewersForDiff.
  const pr4058Files = [
    "apps/hospitality/package.json",
    "apps/marketing/package.json",
    "apps/rialto-web/package.json",
    "infrastructure/pulumi/package.json",
    "package.json",
    "packages/agent-core/package.json",
    "packages/agent-test-utils/package.json",
    "packages/config/package.json",
    "packages/jobs/package.json",
    "packages/mcp-server/package.json",
    "packages/rialto-catalog/package.json",
    "packages/rialto-plugin/package.json",
    "packages/rialto/package.json",
    "packages/service-bootstrap/package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "services/agent/package.json",
    "services/reservations/package.json",
    "services/users/package.json",
    "tools/cli/package.json",
  ];

  it("returns false for PR #4058's exact dependency-bump file list, even though isLowRiskPR is true", () => {
    expect(isLowRiskPR(pr4058Files)).toBe(true);
    expect(qualifiesForLowRiskFastPath(pr4058Files)).toBe(false);
  });

  it("returns true for a metrics-only diff", () => {
    expect(qualifiesForLowRiskFastPath(["metrics/queue-telemetry.jsonl"])).toBe(true);
  });

  it("returns false for a high-risk source file", () => {
    expect(qualifiesForLowRiskFastPath(["src/routes.ts"])).toBe(false);
  });

  it("returns false for an empty file list", () => {
    expect(qualifiesForLowRiskFastPath([])).toBe(false);
  });
});
