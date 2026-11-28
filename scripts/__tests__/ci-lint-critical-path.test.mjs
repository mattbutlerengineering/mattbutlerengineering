import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

/**
 * Lint stays off the PR critical path, and stays a gate.
 *
 * Build and Test take ~10 min each and used to wait for Lint (~2-3 min of
 * ESLint) before starting, although Lint produces nothing they consume.
 * Prepare now produces the `^build` outputs in the Turbo cache, so Build and
 * RLS can start after Prepare while Typecheck runs independently. On run
 * 35909626065, Build/Test started at 19:33:04, 2 min after Typecheck (19:30:33)
 * finished, purely because they were waiting on Lint (19:33:02).
 *
 * Quality is unchanged because CI Gate still needs `lint`, and
 * ci-gate-required-results.mjs fails closed on anything but success/skipped.
 * Parsed textually, matching ci-turbo-cache.test.mjs.
 */
function needsOf(jobName) {
  const lines = WORKFLOW.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^ {2}${jobName}:\\s*$`).test(l));
  if (start === -1) throw new Error(`ci.yml has no top-level \`${jobName}:\` job`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  const block = rest.slice(0, end === -1 ? undefined : end).join("\n");
  const match = block.match(/^ {4}needs:\s*\[([^\]]*)\]/m);
  if (!match) throw new Error(`\`${jobName}\` has no inline needs list`);
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("ci.yml lint critical path", () => {
  it.each(["build", "migrations", "rls-integration"])(
    "%s does not wait for static-checks (lint, typecheck, architecture audit)",
    (job) => {
      expect(needsOf(job)).not.toContain("static-checks");
    }
  );

  it("CI Gate still requires static-checks", () => {
    expect(needsOf("ci-gate")).toContain("static-checks");
  });
});

describe("ci.yml migrations ordering", () => {
  it("migrations waits for Prepare only (#10010: nothing consumes Typecheck output)", () => {
    expect(needsOf("migrations")).toEqual(["prepare"]);
  });
});

describe("ci.yml prepare/typecheck parallelism", () => {
  it.each(["build", "rls-integration"])(
    "%s uses Prepare outputs and runs alongside Typecheck",
    (job) => {
      expect(needsOf(job)).toContain("prepare");
      expect(needsOf(job)).not.toContain("static-checks");
    }
  );

  it("CI Gate still requires static-checks, Build, and RLS Integration", () => {
    expect(needsOf("ci-gate")).toEqual(
      expect.arrayContaining(["static-checks", "build", "rls-integration"])
    );
  });
});

/**
 * Integrity runs only `detect-instruction-rot.mjs` and
 * `check-doc-freshness.mjs`, which read committed files on their own runner.
 * Build passes it no artifact, so waiting for Build only added Integrity's
 * ~45s to the end of the critical path (run 37480517290: Build ended 14:46:14,
 * Integrity 14:46:17-14:47:01, CI Gate 14:47:03).
 */
describe("ci.yml integrity critical path", () => {
  it("repo-checks (integrity, dependency sync, ratchet) does not wait for build", () => {
    expect(needsOf("repo-checks")).not.toContain("build");
  });

  it("CI Gate still requires repo-checks", () => {
    expect(needsOf("ci-gate")).toContain("repo-checks");
  });
});

/**
 * Architecture Audit builds the CLI on its own runner, with no turbo cache
 * step and no artifact, then runs check-adr/check-deps. Build and Test consume
 * none of it, so waiting for it only delayed both by the audit's tail past
 * Typecheck (run 37527830915: Typecheck ended 20:39:16, Architecture Audit
 * 20:40:04, Build/Test started 20:40:05).
 */
describe("ci.yml architecture-audit critical path", () => {
  it.each(["build", "test"])("%s does not wait for the architecture audit", (job) => {
    expect(needsOf(job)).not.toContain("static-checks");
  });

  it("CI Gate still requires the architecture audit (a static-checks step)", () => {
    expect(needsOf("ci-gate")).toContain("static-checks");
  });
});

/**
 * #6665: Test waited on Typecheck only for the turbo `^build` cache. Measured
 * on run 38779620768 (warm) Test replayed 100% of ^build tasks (41/41 across
 * legs) and Typecheck itself 18/19; on cold run 38650413196 Typecheck built 14
 * of 19 and Test then replayed 19/19. Prepare now builds that closure, so Test
 * runs in parallel with Typecheck. Typecheck still gates CI Gate.
 */
describe("ci.yml test/typecheck parallelism", () => {
  it("test does not wait for typecheck", () => {
    expect(needsOf("test")).not.toContain("static-checks");
    expect(needsOf("test")).toContain("prepare");
  });

  it("CI Gate still requires typecheck (a static-checks step) and test", () => {
    expect(needsOf("ci-gate")).toContain("static-checks");
    expect(needsOf("ci-gate")).toContain("test");
  });

  it("prepare builds the ^build closure that Test and Typecheck replay", () => {
    const lines = WORKFLOW.split("\n");
    const start = lines.findIndex((l) => /^ {2}prepare:\s*$/.test(l));
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => /^ {2}\S/.test(l));
    const block = rest.slice(0, end === -1 ? undefined : end).join("\n");
    expect(block).toMatch(/run: pnpm turbo run build --filter='\.\/packages\/\*'/);
    expect(block).toContain("path: .turbo/cache");
  });
});

/**
 * #10009: `lint` and `typecheck` ran as two serial `turbo run` invocations in
 * static-checks. Each task graph has a long single-package tail (the big apps),
 * so the 4-core runner sat partly idle twice. One invocation lets turbo
 * schedule both graphs together and fill those cores.
 *
 * Measured locally (4 cores, `--only --force`, two trials): serial 257 s / 236 s
 * versus combined 217 s / 216 s — about 12% off the pair.
 *
 * `--continue` is what keeps the protection identical to the two steps it
 * replaces, which were chained with `if: ${{ !cancelled() }}`: every package's
 * lint and typecheck still runs even after one fails, and the step still exits
 * non-zero (verified: a planted TS2322 exits 2, a planted `no-debugger` exits 1,
 * both with every other task still executed).
 */
describe("ci.yml lint/typecheck share one turbo invocation (#10009)", () => {
  const staticChecks = (() => {
    const lines = WORKFLOW.split("\n");
    const start = lines.findIndex((l) => /^ {2}static-checks:\s*$/.test(l));
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => /^ {2}\S/.test(l));
    return rest.slice(0, end === -1 ? undefined : end).join("\n");
  })();

  it("runs both tasks in a single turbo invocation", () => {
    expect(staticChecks).toMatch(/run: pnpm turbo run lint typecheck --continue$/m);
  });

  it("no longer runs them as separate serial steps", () => {
    expect(staticChecks).not.toMatch(/^ +run: pnpm lint$/m);
    expect(staticChecks).not.toMatch(/^ +run: pnpm typecheck$/m);
  });

  it("keeps knip as its own step, so a knip failure stays legible", () => {
    expect(staticChecks).toMatch(/^ +run: pnpm check:knip$/m);
  });
});
