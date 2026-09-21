/**
 * Guard for #5465: `pnpm repo-audit` used to be a 24-deep `&&` chain, so the
 * first failing check ended the run and the remaining 23 never executed — a
 * skipped check reads exactly like a passing one, and N independent findings
 * cost N CI cycles at ~5 min each.
 *
 * The runner must execute every check regardless of individual failures,
 * report each one, and exit 0 iff all passed.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_AUDIT_CHECKS, runAllChecks, formatSummary, exitCodeFor } from "../run-repo-audit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const CHECKS = [
  { name: "alpha", command: "node", args: ["alpha.mjs"] },
  { name: "beta", command: "node", args: ["beta.mjs"] },
  { name: "gamma", command: "node", args: ["gamma.mjs"] },
];

describe("runAllChecks", () => {
  it("runs every check in one invocation even when earlier ones fail", () => {
    const ran = [];
    const results = runAllChecks(CHECKS, (check) => {
      ran.push(check.name);
      return { ok: check.name === "beta" };
    });

    expect(ran).toEqual(["alpha", "beta", "gamma"]);
    expect(results).toEqual([
      { name: "alpha", ok: false, detail: "" },
      { name: "beta", ok: true, detail: "" },
      { name: "gamma", ok: false, detail: "" },
    ]);
  });

  it("reports a crashing check as a failure without aborting the remaining checks", () => {
    const results = runAllChecks(CHECKS, (check) => {
      if (check.name === "alpha") throw new Error("ENOENT: no such file");
      return { ok: true };
    });

    expect(results[0]).toEqual({ name: "alpha", ok: false, detail: "ENOENT: no such file" });
    expect(results.slice(1).every((r) => r.ok)).toBe(true);
  });

  it("keeps the detail a check reports (e.g. its exit code)", () => {
    const results = runAllChecks([CHECKS[0]], () => ({ ok: false, detail: "exit 2" }));

    expect(results).toEqual([{ name: "alpha", ok: false, detail: "exit 2" }]);
  });
});

describe("exitCodeFor", () => {
  it("is 0 iff every check passed", () => {
    expect(exitCodeFor([{ name: "a", ok: true, detail: "" }])).toBe(0);
    expect(exitCodeFor([])).toBe(0);
  });

  it("is non-zero when any check failed", () => {
    expect(
      exitCodeFor([
        { name: "a", ok: true, detail: "" },
        { name: "b", ok: false, detail: "" },
      ])
    ).toBe(1);
  });
});

describe("formatSummary", () => {
  const results = [
    { name: "alpha", ok: false, detail: "exit 1" },
    { name: "beta", ok: true, detail: "" },
    { name: "gamma", ok: false, detail: "crashed" },
  ];

  it("lists a PASS/FAIL line for every check", () => {
    const summary = formatSummary(results);

    expect(summary).toContain("FAIL  alpha (exit 1)");
    expect(summary).toContain("PASS  beta");
    expect(summary).toContain("FAIL  gamma (crashed)");
  });

  it("ends with a count naming every failed check", () => {
    expect(formatSummary(results).trim().split("\n").at(-1)).toBe(
      "2 of 3 checks failed: alpha, gamma"
    );
  });

  it("says so when everything passed", () => {
    expect(
      formatSummary([{ name: "alpha", ok: true, detail: "" }])
        .trim()
        .split("\n")
        .at(-1)
    ).toBe("1 of 1 checks passed");
  });
});

// ── Wiring invariant (#4628, repointed by #5465) ─────────────────────────
// The check list moved out of package.json's `&&` chain into REPO_AUDIT_CHECKS.
// That array is now the source of truth for "is this check wired up?".
describe("REPO_AUDIT_CHECKS is the audit's source of truth", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

  it("is what package.json's repo-audit script runs", () => {
    expect(pkg.scripts["repo-audit"]).toBe("node scripts/run-repo-audit.mjs");
  });

  it("carries every check the pre-#5465 chain ran", () => {
    expect(REPO_AUDIT_CHECKS.map((c) => c.name)).toEqual([
      "prettier",
      "check-circular-deps",
      "check-dep-versions",
      "check-env-sync",
      "check-service-bindings",
      "check-analytics-bindings",
      "check-destructive-migrations",
      "check-dockerfile-deps",
      "check-schema-compat",
      "check-ci-dispatch",
      "check-issue-filing-seam",
      "check-workflow-deps",
      "check-workflow-paths-coverage",
      "check-hook-wiring",
      "check-deploy-secret-provisioning",
      "check-orphaned-tests",
      "check-orphaned-collectors",
      "check-audit-persistence-caller",
      "check-story-coverage",
      "check-rialto-changeset",
      "check-claude-md-table-drift",
      "check-ci-gate-coverage",
      "check-workflow-pr-scope",
      "check-memory-refs",
      "check-skill-references",
      "boundaries",
    ]);
  });

  it("keeps `pnpm audit` outside the runner (#4993)", () => {
    const flattened = REPO_AUDIT_CHECKS.map((c) => [c.command, ...c.args].join(" ")).join("\n");

    expect(flattened).not.toContain("audit --audit-level");
    expect(pkg.scripts["audit:security"]).toContain("pnpm audit --audit-level=high");
  });

  it("gives every check a unique name and a runnable command", () => {
    const names = REPO_AUDIT_CHECKS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const check of REPO_AUDIT_CHECKS) {
      expect(check.command).toBeTruthy();
      expect(Array.isArray(check.args)).toBe(true);
      expect(check.args.length).toBeGreaterThan(0);
    }
  });
});
