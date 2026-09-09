/**
 * Contract tests for scripts/check-dep-sync.mjs — the `Dependency Sync` CI
 * gate (ci.yml job `dependency-audit`).
 *
 * The defect class under test: fail-open accounting. `totalGaps` was only
 * incremented in the success branch, so a run where depcheck failed for every
 * package (registry blip, npx resolution failure, non-zero exit with empty
 * stdout) printed one ⚠️ per package and then `✅ Workspace dependency sync
 * verified.` with exit 0 — indistinguishable from a run that audited all 28
 * packages and found nothing.
 *
 * Style follows hook-input.test.mjs: execute the real script inside a
 * throwaway sandbox with a stub `npx` on PATH, rather than asserting on
 * source text.
 */

import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyDepcheckResult, evaluateDepSync } from "../check-dep-sync.mjs";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "check-dep-sync.mjs");

const cleanups = [];
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop(), { recursive: true, force: true });
});

/** The shape a healthy depcheck emits for a package with no findings. */
const CLEAN_PAYLOAD =
  '{"dependencies":[],"devDependencies":[],"missing":{},"using":{},"invalidFiles":{},"invalidDirs":{}}';

/** A depcheck run that never produces output — registry blip / npx failure. */
const STUB_SPAWN_FAILURE = `#!/bin/sh
echo "npm ERR! ECONNRESET registry unreachable" >&2
exit 1
`;

/** Answers clean for every package. */
const STUB_ALL_CLEAN = `#!/bin/sh
echo '${CLEAN_PAYLOAD}'
`;

/** Clean for apps/site, spawn failure for everything else. */
const STUB_MIXED = `#!/bin/sh
case "$*" in
  *apps/site*) echo '${CLEAN_PAYLOAD}' ;;
  *) echo "npm ERR! ECONNRESET registry unreachable" >&2; exit 1 ;;
esac
`;

/** Reports two missing dependencies (depcheck itself exits non-zero then). */
const STUB_MISSING_DEPS = `#!/bin/sh
echo '{"dependencies":[],"devDependencies":[],"missing":{"lodash":["src/a.js"],"zod":["src/b.js"]},"using":{},"invalidFiles":{},"invalidDirs":{}}'
exit 255
`;

/**
 * Valid JSON with no \`missing\` key at all — the shape a future depcheck
 * major that restructures its output would produce. Must never read as clean.
 */
const STUB_SHAPE_DRIFT = `#!/bin/sh
echo '{"issues":{"missing":{}}}'
`;

/**
 * Build a sandbox workspace: `packages` are workspace-relative dirs (each gets
 * a package.json so the walk discovers it), `npxStub` is the shell script that
 * will shadow the real npx for the script's depcheck spawns.
 */
function makeFixture({ packages, npxStub }) {
  const root = mkdtempSync(join(tmpdir(), "dep-sync-"));
  cleanups.push(root);
  for (const pkg of packages) {
    const dir = join(root, pkg);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: pkg.replace(/\//g, "-") }));
  }
  const bin = join(root, "stub-bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "npx"), npxStub);
  chmodSync(join(bin, "npx"), 0o755);
  return { root, bin };
}

function runScript({ root, bin }) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
}

describe("check-dep-sync gate accounting", () => {
  it("fails the gate when every package fails to audit (never a hollow green)", () => {
    const fixture = makeFixture({
      packages: ["apps/site", "packages/lib"],
      npxStub: STUB_SPAWN_FAILURE,
    });
    const run = runScript(fixture);

    // A gate that audited zero packages must never report success.
    expect(run.status).toBe(1);
    expect(run.stdout).not.toContain("Workspace dependency sync verified");
  });

  it("fails when some packages audit and some fail", () => {
    const fixture = makeFixture({
      packages: ["apps/site", "packages/lib"],
      npxStub: STUB_MIXED,
    });
    const run = runScript(fixture);

    expect(run.status).toBe(1);
    expect(run.stdout).not.toContain("Workspace dependency sync verified");
    expect(run.stderr).toContain("could not be audited");
  });

  it("fails when zero packages are discovered (never a silent pass)", () => {
    const fixture = makeFixture({ packages: [], npxStub: STUB_ALL_CLEAN });
    const run = runScript(fixture);

    expect(run.status).toBe(1);
    expect(run.stdout).not.toContain("Workspace dependency sync verified");
    expect(run.stderr).toContain("No workspace packages discovered");
  });

  it("passes and prints the success line when every package audits cleanly", () => {
    const fixture = makeFixture({
      packages: ["apps/site", "packages/lib", "services/api", "tools/cli"],
      npxStub: STUB_ALL_CLEAN,
    });
    const run = runScript(fixture);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("✅ Workspace dependency sync verified.");
  });

  it("fails with the count when a package has missing dependencies", () => {
    const fixture = makeFixture({
      packages: ["apps/site"],
      npxStub: STUB_MISSING_DEPS,
    });
    const run = runScript(fixture);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Total dependency gaps found: 2");
    expect(run.stderr).toContain("lodash");
    expect(run.stderr).toContain("zod");
  });

  it("treats a payload without a `missing` key as failed-to-audit, never clean", () => {
    const fixture = makeFixture({
      packages: ["apps/site"],
      npxStub: STUB_SHAPE_DRIFT,
    });
    const run = runScript(fixture);

    expect(run.status).toBe(1);
    expect(run.stdout).not.toContain("All imports matched");
    expect(run.stdout).not.toContain("Workspace dependency sync verified");
  });
});

describe("classifyDepcheckResult", () => {
  it("classifies empty stdout as failed", () => {
    expect(classifyDepcheckResult("").outcome).toBe("failed");
  });

  it("classifies the no-missing-key drift shape as failed", () => {
    expect(classifyDepcheckResult('{"issues":{}}').outcome).toBe("failed");
    expect(classifyDepcheckResult('{"missing":null}').outcome).toBe("failed");
    expect(classifyDepcheckResult('{"missing":["lodash"]}').outcome).toBe("failed");
  });

  it("classifies an empty missing object as clean and a populated one as gaps", () => {
    expect(classifyDepcheckResult(CLEAN_PAYLOAD).outcome).toBe("clean");
    expect(classifyDepcheckResult('{"missing":{"lodash":["src/a.js"]}}')).toEqual({
      outcome: "gaps",
      missing: ["lodash"],
    });
  });
});

describe("depcheck tool pin", () => {
  // Same class as the Pulumi runner-image float (gotchas.md § Pulumi / R2,
  // pulumi-cli-pin.test.mjs): an unpinned `npx depcheck` runs whatever the
  // registry serves today. A future major that restructures its JSON would
  // make every package read as failed-to-audit at best — pin exactly.
  it("pins depcheck to an exact version, not a range or a bare name", async () => {
    const { DEPCHECK_SPEC } = await import("../check-dep-sync.mjs");
    expect(DEPCHECK_SPEC).toMatch(/^depcheck@\d+\.\d+\.\d+$/);
  });

  it("spawns depcheck through the pinned spec", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toMatch(/spawnSync\(\s*"npx",\s*\[DEPCHECK_SPEC,/);
  });
});

describe("dependency-audit job in ci.yml", () => {
  // Parsed textually rather than with a YAML library, matching the precedent
  // in ci-node-matrix.test.mjs and pulumi-cli-pin.test.mjs.
  it("declares timeout-minutes", () => {
    const workflow = readFileSync(join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8");
    const jobStart = workflow.indexOf("\n  dependency-audit:");
    expect(jobStart).toBeGreaterThan(-1);
    const rest = workflow.slice(jobStart + 1);
    const nextJob = rest.slice(1).search(/\n {2}[\w-]+:/);
    const jobBlock = nextJob === -1 ? rest : rest.slice(0, nextJob + 1);
    expect(jobBlock).toMatch(/^\s+timeout-minutes:\s*\d+$/m);
  });
});

describe("evaluateDepSync", () => {
  it("is only ok with a positive discovered count, zero failures, zero gaps", () => {
    expect(evaluateDepSync([]).ok).toBe(false);
    expect(evaluateDepSync([{ outcome: "clean" }, { outcome: "failed" }]).ok).toBe(false);
    expect(evaluateDepSync([{ outcome: "gaps", missing: ["a"] }]).ok).toBe(false);
    expect(evaluateDepSync([{ outcome: "clean" }, { outcome: "clean" }]).ok).toBe(true);
  });

  it("reports audited as discovered minus failed-to-audit", () => {
    const verdict = evaluateDepSync([
      { outcome: "clean" },
      { outcome: "failed" },
      { outcome: "gaps", missing: ["a", "b"] },
    ]);
    expect(verdict).toEqual({
      discovered: 3,
      audited: 2,
      clean: 1,
      failed: 1,
      gaps: 2,
      ok: false,
    });
  });
});
