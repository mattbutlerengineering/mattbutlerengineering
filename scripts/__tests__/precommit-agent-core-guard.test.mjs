import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PRE_COMMIT = readFileSync(resolve(ROOT, ".husky/pre-commit"), "utf8");

/**
 * `.husky/pre-commit` runs `check-adr`, which reaches `@mbe/agent-core`
 * through the CLI's module graph. `packages/agent-core/dist` is gitignored,
 * so a fresh worktree has none and the commit aborts with an opaque
 * `ERR_MODULE_NOT_FOUND` / `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` stack trace
 * that says nothing about what to do.
 *
 * Reproduced 2026-09-21 by deleting the dist in a worktree:
 *
 *   $ pnpm --filter @mbe/cli start check-adr --staged
 *   ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @mbe/cli@0.0.0 start: ...
 *   $ node scripts/agent-core-build-freshness.mjs check
 *   {"trusted":true,"state":"fresh","rebuildAttempted":true,"rebuildSucceeded":true}
 *   $ pnpm --filter @mbe/cli start check-adr --staged
 *   ✅ No architectural violations detected.
 *
 * The remedy already existed: `scripts/agent-core-build-freshness.mjs` (#3989),
 * pure + unit-tested, with a `check` CLI that rebuilds once when the dist
 * cannot be proven fresh and never throws. It was wired into
 * `/implement-queue` Phase 2 but not into the path where this fails most
 * often and most opaquely.
 */
describe(".husky/pre-commit agent-core guard", () => {
  it("ensures the agent-core dist before running check-adr", () => {
    expect(PRE_COMMIT).toMatch(/agent-core-build-freshness\.mjs check/);
  });

  it("runs the guard BEFORE check-adr, not after", () => {
    // Compare COMMAND lines, not raw offsets. The guard's own comment names
    // check-adr several lines above the guard command, so a plain
    // `indexOf("check-adr")` reports the comment and inverts the answer —
    // which is exactly how this assertion first failed against a correct hook.
    const commands = PRE_COMMIT.split("\n").filter(
      (l) => l.trim() !== "" && !l.trim().startsWith("#")
    );
    const guard = commands.findIndex((l) => l.includes("agent-core-build-freshness.mjs"));
    const checkAdr = commands.findIndex((l) => l.includes("start check-adr"));
    expect(guard, "guard command not found").toBeGreaterThan(-1);
    expect(checkAdr, "check-adr command not found").toBeGreaterThan(-1);
    expect(guard).toBeLessThan(checkAdr);
  });

  it("leaves check-adr as the gate — the guard must not be able to block a commit", () => {
    // The guard is preparation, not a check. `ensureFreshAgentCoreBuild` never
    // throws, but it exits 1 when the dist still cannot be proven fresh — which
    // matters for the PR-risk classifier, NOT for check-adr. Letting that abort
    // the commit would turn a build-cache detail into a hard block, so its
    // failure must degrade to an actionable message with check-adr still
    // deciding. This is the one place `|| <message>` is correct rather than a
    // swallowed failure: the message IS the signal, and the real gate follows.
    const line = PRE_COMMIT.split("\n").find(
      (l) => l.includes("agent-core-build-freshness.mjs") && !l.trim().startsWith("#")
    );
    expect(line, "guard line not found outside comments").toBeDefined();
    expect(PRE_COMMIT).toMatch(/agent-core-build-freshness\.mjs check[^\n]*\|\|/);
    // ...and it must say what to actually run.
    expect(PRE_COMMIT).toMatch(/pnpm build --filter @mbe\/cli\.\.\./);
  });
});
