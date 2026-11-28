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
import { BLOCKED_EXIT_CODES } from "../check-rialto-changeset.mjs";
import { UNVERIFIED_EXIT_CODES } from "../check-ready-label-exclusive.mjs";

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

// ── BLOCKED (#9203): an environmental blocker is not a violation ─────────
describe("blocked checks", () => {
  const BLOCKED = { 10: "shallow clone — base unresolvable" };
  const blockable = { name: "alpha", command: "node", args: ["alpha.mjs"], blocked: BLOCKED };

  it("marks a check exiting with a declared blocked code as blocked, still not ok", () => {
    const [result] = runAllChecks([blockable], () => ({ ok: false, detail: "exit 10" }));
    expect(result).toEqual({
      name: "alpha",
      ok: false,
      blocked: true,
      detail: "shallow clone — base unresolvable",
    });
  });

  it("leaves an undeclared exit code as a plain failure", () => {
    const [result] = runAllChecks([blockable], () => ({ ok: false, detail: "exit 1" }));
    expect(result).toEqual({ name: "alpha", ok: false, detail: "exit 1" });
  });

  it("summarises BLOCKED distinctly from FAIL and keeps the run non-zero", () => {
    const results = [
      { name: "alpha", ok: false, blocked: true, detail: "shallow clone — base unresolvable" },
      { name: "beta", ok: false, detail: "exit 1" },
      { name: "gamma", ok: true, detail: "" },
    ];
    const summary = formatSummary(results);
    expect(summary).toContain("BLOCKED  alpha (shallow clone — base unresolvable)");
    expect(summary).toContain("FAIL  beta (exit 1)");
    expect(summary.split("\n").at(-1)).toBe(
      "2 of 3 checks did not pass: 1 failed (beta), 1 blocked (alpha)"
    );
    expect(exitCodeFor(results)).toBe(1);
  });

  it("wires check-destructive-migrations' blocked code into the audit (#10143)", () => {
    const check = REPO_AUDIT_CHECKS.find((c) => c.name === "check-destructive-migrations");
    expect(check.blocked?.[10]).toBe("base unresolvable — shallow clone or origin/main missing");
  });

  it("wires check-rialto-changeset's blocked codes into the audit", () => {
    const check = REPO_AUDIT_CHECKS.find((c) => c.name === "check-rialto-changeset");
    expect(check.blocked[BLOCKED_EXIT_CODES.shallow]).toBe("shallow clone — base unresolvable");
  });
});

// ── UNVERIFIED (#9922): a check that could not reach its input is not a pass ──
// `check-ready-label-exclusive` reads live GitHub state and used to exit 0 when
// `gh` could not answer, so the summary printed `PASS` for a gate that never
// ran — the normal outcome in CCR sessions (GraphQL blocked) and in CI's Build
// job (no token). UNVERIFIED is a third outcome: not a pass, not a violation.
describe("unverified checks", () => {
  const UNVERIFIED = { 13: "gh unreachable — exclusivity not verified" };
  const verifiable = {
    name: "alpha",
    command: "node",
    args: ["alpha.mjs"],
    unverified: UNVERIFIED,
  };

  it("maps a declared unverified exit code to UNVERIFIED, not a pass", () => {
    const [result] = runAllChecks([verifiable], () => ({ ok: false, detail: "exit 13" }));

    expect(result).toEqual({
      name: "alpha",
      ok: true,
      unverified: true,
      detail: "gh unreachable — exclusivity not verified",
    });
  });

  it("leaves an undeclared exit code as a plain failure", () => {
    const [result] = runAllChecks([verifiable], () => ({ ok: false, detail: "exit 1" }));

    expect(result).toEqual({ name: "alpha", ok: false, detail: "exit 1" });
  });

  it("labels it UNVERIFIED and never PASS, without reddening the run", () => {
    const results = [
      { name: "alpha", ok: true, unverified: true, detail: "gh unreachable" },
      { name: "beta", ok: true, detail: "" },
    ];
    const summary = formatSummary(results);

    expect(summary).toContain("UNVERIFIED  alpha (gh unreachable)");
    expect(summary).not.toContain("PASS  alpha");
    expect(summary.split("\n").at(-1)).toBe("1 of 2 checks verified: 1 unverified (alpha)");
    expect(exitCodeFor(results)).toBe(0);
  });

  it("names the unverified check alongside real failures rather than masking them", () => {
    const results = [
      { name: "alpha", ok: true, unverified: true, detail: "gh unreachable" },
      { name: "beta", ok: false, detail: "exit 1" },
    ];

    expect(formatSummary(results).split("\n").at(-1)).toBe(
      "1 of 2 checks failed: beta; 1 unverified (alpha)"
    );
    expect(exitCodeFor(results)).toBe(1);
  });

  it("wires check-ready-label-exclusive's unverified code into the audit", () => {
    const check = REPO_AUDIT_CHECKS.find((c) => c.name === "check-ready-label-exclusive");

    expect(check.unverified?.[UNVERIFIED_EXIT_CODES["github-unreachable"]]).toBeTruthy();
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
      "check-rate-limit-bindings",
      "check-destructive-migrations",
      "check-dockerfile-deps",
      "check-schema-compat",
      "check-ci-dispatch",
      "check-pipe-to-shell-pipefail",
      "check-action-pins",
      "check-pulumi-version-assertion",
      "check-issue-filing-seam",
      "check-workflow-deps",
      "check-workflow-paths-coverage",
      "check-hook-wiring",
      "check-hooks-active",
      "check-cursorrules-drift",
      "check-deploy-secret-provisioning",
      "check-orphaned-tests",
      "check-orphaned-collectors",
      "check-orphaned-cli-commands",
      "check-audit-persistence-caller",
      "check-story-coverage",
      "check-rialto-changeset",
      "check-changeset-tree",
      "check-claude-md-table-drift",
      "check-ci-gate-coverage",
      "check-workflow-pr-scope",
      "check-ready-label-exclusive",
      "check-memory-refs",
      "check-skill-references",
      "check-i18n-catalogs",
      "boundaries",
      "check-boundaries-coverage",
    ]);
  });

  // ci.yml and `pnpm pre-commit:full` run these without a `.metrics-data/`
  // checkout, and metrics-store throws without one (#9815). A check that needs
  // telemetry belongs in a workflow that pulls the data branch.
  it("has no check that reaches the metrics-data branch through its imports", () => {
    const DATA_MODULES = new Set([
      "metrics-store.mjs",
      "queue-telemetry-store.mjs",
      "metrics-data.mjs",
    ]);
    const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
    const reaches = (file, seen = new Set()) => {
      if (seen.has(file)) return [];
      seen.add(file);
      let source;
      try {
        source = readFileSync(file, "utf-8");
      } catch {
        return [];
      }
      const hits = [];
      for (const [, spec] of source.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
        const target = join(dirname(file), spec);
        if (DATA_MODULES.has(spec.split("/").pop())) hits.push(`${file} -> ${spec}`);
        else hits.push(...reaches(target, seen));
      }
      return hits;
    };

    const offenders = REPO_AUDIT_CHECKS.flatMap((check) =>
      check.args
        .filter((arg) => arg.startsWith("scripts/"))
        .flatMap((arg) => reaches(join(scriptsDir, "..", arg)))
    );

    expect(offenders).toEqual([]);
    expect(REPO_AUDIT_CHECKS.map((c) => c.name)).not.toContain("check-queue-telemetry-dupes");
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
