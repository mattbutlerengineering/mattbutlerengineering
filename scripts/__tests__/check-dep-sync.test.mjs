/**
 * Contract tests for scripts/check-dep-sync.mjs — the `Dependency Sync` CI
 * gate (a step of ci.yml job `repo-checks`, #10010).
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

import {
  classifyDepcheckResult,
  evaluateDepSync,
  auditPackages,
  AUDIT_CONCURRENCY,
} from "../check-dep-sync.mjs";

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
case "$*" in *--version*) echo "1.4.7"; exit 0 ;; esac
echo "npm ERR! ECONNRESET registry unreachable" >&2
exit 1
`;

/** Fails every invocation, including the priming `--version` call. */
const STUB_SPAWN_FAILURE_ALWAYS = `#!/bin/sh
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
  *--version*) echo "1.4.7" ;;
  *apps/site*) echo '${CLEAN_PAYLOAD}' ;;
  *) echo "npm ERR! ECONNRESET registry unreachable" >&2; exit 1 ;;
esac
`;

/** Reports two missing dependencies (depcheck itself exits non-zero then). */
const STUB_MISSING_DEPS = `#!/bin/sh
case "$*" in *--version*) echo "1.4.7"; exit 0 ;; esac
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
 * Records one `start`/`end` line per invocation in $DEP_SYNC_STUB_LOG while
 * holding the slot open, so a test can tell an overlapping fan-out from a
 * serial one by reading the interleaving.
 */
const STUB_RECORDS_OVERLAP = `#!/bin/sh
case "$*" in *--version*)
  echo "prime-start" >> "$DEP_SYNC_STUB_LOG"
  sleep 0.2
  echo "prime-end" >> "$DEP_SYNC_STUB_LOG"
  echo "1.4.7"
  exit 0 ;;
esac
echo "start" >> "$DEP_SYNC_STUB_LOG"
sleep 0.4
echo "end" >> "$DEP_SYNC_STUB_LOG"
echo '${CLEAN_PAYLOAD}'
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

function runScript({ root, bin }, extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...extraEnv },
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
    expect(source).toMatch(/execFileAsync\(\s*"npx",\s*\[DEPCHECK_SPEC,/);
  });
});

describe("repo-checks job (hosts Dependency Sync) in ci.yml", () => {
  // Parsed textually rather than with a YAML library, matching the precedent
  // in ci-node-matrix.test.mjs and pulumi-cli-pin.test.mjs.
  it("declares timeout-minutes", () => {
    const workflow = readFileSync(join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8");
    const jobStart = workflow.indexOf("\n  repo-checks:");
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

describe("auditPackages fan-out", () => {
  /** Resolves after `ms`, recording its own overlap window in `live`. */
  function tracker(ms) {
    const live = { now: 0, peak: 0 };
    const audit = () =>
      new Promise((resolveAudit) => {
        live.now += 1;
        live.peak = Math.max(live.peak, live.now);
        setTimeout(() => {
          live.now -= 1;
          resolveAudit({ outcome: "clean" });
        }, ms);
      });
    return { live, audit };
  }

  it("runs audits concurrently rather than one package at a time", async () => {
    // The defect: 28 packages x one blocking `npx depcheck` each, in series,
    // measured 2m29s locally and ~1m52s as the `Dependency Sync` CI step.
    const { live, audit } = tracker(5);
    await auditPackages(["a", "b", "c", "d"], audit, 4);
    expect(live.peak).toBeGreaterThan(1);
  });

  it("never exceeds the concurrency bound", async () => {
    const { live, audit } = tracker(5);
    await auditPackages(["a", "b", "c", "d", "e", "f", "g"], audit, 3);
    expect(live.peak).toBe(3);
  });

  it("returns one outcome per package, in the order the packages were given", async () => {
    const outcomes = await auditPackages(
      ["a", "b", "c"],
      // Finishes in reverse order, so an implementation that pushes on
      // completion rather than by index would scramble the association.
      async (pkg) => {
        const delay = { a: 15, b: 10, c: 1 }[pkg];
        await new Promise((r) => setTimeout(r, delay));
        return { outcome: "gaps", missing: [pkg] };
      },
      3
    );
    expect(outcomes.map((o) => o.missing[0])).toEqual(["a", "b", "c"]);
  });

  it("audits more than one package at a time with the shipped bound", () => {
    expect(AUDIT_CONCURRENCY).toBeGreaterThan(1);
  });
});

describe("check-dep-sync fan-out wiring", () => {
  it("overlaps its depcheck invocations instead of serialising them", () => {
    const fixture = makeFixture({
      packages: ["apps/a", "apps/b", "packages/c", "packages/d"],
      npxStub: STUB_RECORDS_OVERLAP,
    });
    const log = join(fixture.root, "stub.log");
    const run = runScript(fixture, { DEP_SYNC_STUB_LOG: log });

    expect(run.status).toBe(0);
    const lines = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter((line) => !line.startsWith("prime-"));
    expect(lines).toHaveLength(8);
    // Serial execution can only ever produce start,end,start,end,...
    const overlapped = lines.some((line, i) => line === "start" && lines[i + 1] === "start");
    expect(overlapped).toBe(true);
  });

  it("resolves depcheck once, to completion, before the first concurrent audit starts (#10226)", () => {
    const fixture = makeFixture({
      packages: ["apps/a", "apps/b", "packages/c", "packages/d"],
      npxStub: STUB_RECORDS_OVERLAP,
    });
    const log = join(fixture.root, "stub.log");
    const run = runScript(fixture, { DEP_SYNC_STUB_LOG: log });

    expect(run.status).toBe(0);
    const lines = readFileSync(log, "utf8").trim().split("\n");
    expect(lines.slice(0, 2)).toEqual(["prime-start", "prime-end"]);
    expect(lines.filter((line) => line.startsWith("prime-"))).toHaveLength(2);
  });

  it("fails the script with a clear message when the priming call fails (#10226)", () => {
    const fixture = makeFixture({ packages: ["apps/a"], npxStub: STUB_SPAWN_FAILURE_ALWAYS });
    const run = runScript(fixture);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Could not resolve depcheck@");
    expect(run.stderr).toContain("ECONNRESET");
    expect(run.stdout).not.toContain("Auditing");
  });
});
