/**
 * Regression tests for #5296: an `isolation: "worktree"` agent can be handed a
 * base with no common git ancestor to `main` (or a badly stale one), and
 * nothing notices until the merge train hits
 * `fatal: refusing to merge unrelated histories`.
 *
 * The pure decision is tested with injected inputs only — no shelling out to
 * git — so every state, including `unknown`, is reachable deterministically.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyWorktreeBase,
  assessWorktreeBase,
  DEFAULT_MAX_COMMITS_BEHIND,
  DEFAULT_MAX_BASE_AGE_MS,
  REMEDIATION,
} from "../worktree-base-freshness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HOUR_MS = 60 * 60 * 1000;

/** A base that is in every way good: related, current, and minutes old. */
const FRESH_INPUT = { mergeBaseFound: true, commitsBehind: 0, baseAgeMs: 5 * 60 * 1000 };

describe("classifyWorktreeBase — the pure decision", () => {
  it("#5296 repro: no common ancestor is `unrelated`, never `stale`", () => {
    // `git merge-base <worker-branch> origin/main` exited 1 with empty output
    // on worktrees agent-a4a984f281207db68 / agent-a7d652349d06876ee.
    const result = classifyWorktreeBase({
      mergeBaseFound: false,
      commitsBehind: null,
      baseAgeMs: null,
    });

    expect(result.state).toBe("unrelated");
    expect(result.fresh).toBe(false);
  });

  it("`unrelated` wins even when the other signals look fine", () => {
    const result = classifyWorktreeBase({
      mergeBaseFound: false,
      commitsBehind: 0,
      baseAgeMs: 1000,
    });

    expect(result.state).toBe("unrelated");
    expect(result.fresh).toBe(false);
  });

  it("2026-09-20 measured evidence: 368 commits behind is `stale`", () => {
    const result = classifyWorktreeBase({
      mergeBaseFound: true,
      commitsBehind: 368,
      baseAgeMs: 2 * 24 * HOUR_MS,
    });

    expect(result.state).toBe("stale");
    expect(result.fresh).toBe(false);
    expect(result.reason).toContain("368");
  });

  it("#5296 original incident: a 4-day-old base is `stale` on age alone", () => {
    const result = classifyWorktreeBase({
      mergeBaseFound: true,
      commitsBehind: 0,
      baseAgeMs: 4 * 24 * HOUR_MS,
    });

    expect(result.state).toBe("stale");
    expect(result.fresh).toBe(false);
  });

  it("a related, current, recent base is `fresh`", () => {
    const result = classifyWorktreeBase(FRESH_INPUT);

    expect(result.state).toBe("fresh");
    expect(result.fresh).toBe(true);
  });

  it("exactly at each threshold is `fresh`, not `stale` (boundary is inclusive)", () => {
    const result = classifyWorktreeBase({
      mergeBaseFound: true,
      commitsBehind: DEFAULT_MAX_COMMITS_BEHIND,
      baseAgeMs: DEFAULT_MAX_BASE_AGE_MS,
    });

    expect(result.state).toBe("fresh");
    expect(result.fresh).toBe(true);
  });

  it("one commit past the commit threshold is `stale`", () => {
    const result = classifyWorktreeBase({
      ...FRESH_INPUT,
      commitsBehind: DEFAULT_MAX_COMMITS_BEHIND + 1,
    });

    expect(result.state).toBe("stale");
  });

  it("one millisecond past the age threshold is `stale`", () => {
    const result = classifyWorktreeBase({
      ...FRESH_INPUT,
      baseAgeMs: DEFAULT_MAX_BASE_AGE_MS + 1,
    });

    expect(result.state).toBe("stale");
  });

  it("honours caller-supplied thresholds", () => {
    const strict = classifyWorktreeBase({
      mergeBaseFound: true,
      commitsBehind: 3,
      baseAgeMs: 1000,
      maxCommitsBehind: 2,
    });

    expect(strict.state).toBe("stale");
  });

  describe("fails closed on `unknown` — never treats undeterminable as fresh", () => {
    it("undeterminable ancestry (null, not false) is `unknown`", () => {
      const result = classifyWorktreeBase({
        mergeBaseFound: null,
        commitsBehind: 0,
        baseAgeMs: 1000,
      });

      expect(result.state).toBe("unknown");
      expect(result.fresh).toBe(false);
    });

    it("an uncountable commit distance is `unknown`, not `fresh`", () => {
      const result = classifyWorktreeBase({ ...FRESH_INPUT, commitsBehind: null });

      expect(result.state).toBe("unknown");
      expect(result.fresh).toBe(false);
    });

    it("an undeterminable base age is `unknown`, not `fresh`", () => {
      const result = classifyWorktreeBase({ ...FRESH_INPUT, baseAgeMs: null });

      expect(result.state).toBe("unknown");
      expect(result.fresh).toBe(false);
    });

    it("an unrefreshed origin/main is `unknown` — a stale ref makes a stale base look current", () => {
      const result = classifyWorktreeBase({ ...FRESH_INPUT, remoteRefFetched: false });

      expect(result.state).toBe("unknown");
      expect(result.fresh).toBe(false);
    });

    it("NaN counts are `unknown`, not silently coerced", () => {
      const result = classifyWorktreeBase({ ...FRESH_INPUT, commitsBehind: Number.NaN });

      expect(result.state).toBe("unknown");
    });
  });

  it("reports determinate staleness over `unknown` when both apply", () => {
    // The commit count proves the base is far behind; the age lookup failed.
    // `stale` is the more actionable verdict and both fail closed anyway.
    const result = classifyWorktreeBase({
      mergeBaseFound: true,
      commitsBehind: 368,
      baseAgeMs: null,
    });

    expect(result.state).toBe("stale");
    expect(result.fresh).toBe(false);
  });

  it("carries the remediation on every non-fresh state and none on fresh", () => {
    const nonFresh = [
      { mergeBaseFound: false },
      { mergeBaseFound: null },
      { mergeBaseFound: true, commitsBehind: 9999, baseAgeMs: 0 },
      { ...FRESH_INPUT, baseAgeMs: null },
    ];

    for (const input of nonFresh) {
      expect(classifyWorktreeBase(input).remediation).toBe(REMEDIATION);
    }
    expect(classifyWorktreeBase(FRESH_INPUT).remediation).toBeNull();
  });

  it("returns exactly the four documented states and nothing else", () => {
    const states = new Set(
      [
        { mergeBaseFound: false },
        { mergeBaseFound: null },
        { mergeBaseFound: true, commitsBehind: 9999, baseAgeMs: 0 },
        { ...FRESH_INPUT, commitsBehind: null },
        FRESH_INPUT,
      ].map((input) => classifyWorktreeBase(input).state)
    );

    expect([...states].sort()).toEqual(["fresh", "stale", "unknown", "unrelated"]);
  });
});

/**
 * Builds a fake `execFileSync` from a map of git-argument prefix → stdout. A
 * value of `null` makes that command throw, the way a non-zero git exit does.
 */
function fakeGit(responses) {
  const calls = [];
  const exec = (_cmd, args) => {
    const line = args.join(" ");
    calls.push(line);
    for (const [prefix, out] of Object.entries(responses)) {
      if (line.startsWith(prefix)) {
        if (out === null) throw new Error(`git ${prefix} exited 1`);
        return out;
      }
    }
    throw new Error(`unstubbed git ${line}`);
  };
  return { exec, calls };
}

const NOW_MS = Date.parse("2026-09-20T12:00:00Z");
const nowSeconds = (isoish) => String(Math.floor(Date.parse(isoish) / 1000));

describe("assessWorktreeBase — the thin git wrapper", () => {
  it("reports `unrelated` when git merge-base exits non-zero", () => {
    const { exec } = fakeGit({
      fetch: "",
      "rev-parse --verify origin/main": "7a3961d0a\n",
      "rev-parse --verify HEAD": "966baaa30\n",
      "merge-base": null,
    });

    const result = assessWorktreeBase({ exec, now: () => NOW_MS });

    expect(result.state).toBe("unrelated");
    expect(result.fresh).toBe(false);
  });

  it("reports `stale` with the real commit distance and base age", () => {
    const { exec } = fakeGit({
      fetch: "",
      "rev-parse --verify origin/main": "7a3961d0a\n",
      "rev-parse --verify HEAD": "deadbeef\n",
      "merge-base": "966baaa30\n",
      "rev-list --count": "368\n",
      "log -1": `${nowSeconds("2026-09-16T12:00:00Z")}\n`,
    });

    const result = assessWorktreeBase({ exec, now: () => NOW_MS });

    expect(result.state).toBe("stale");
    expect(result.commitsBehind).toBe(368);
    expect(result.baseAgeMs).toBe(4 * 24 * HOUR_MS);
  });

  it("reports `fresh` for a worktree sitting on origin/main", () => {
    const { exec, calls } = fakeGit({
      fetch: "",
      "rev-parse --verify": "7a3961d0a\n",
      "merge-base": "7a3961d0a\n",
      "rev-list --count": "0\n",
      "log -1": `${nowSeconds("2026-09-20T11:30:00Z")}\n`,
    });

    const result = assessWorktreeBase({ exec, now: () => NOW_MS });

    expect(result.state).toBe("fresh");
    expect(result.fresh).toBe(true);
    expect(calls[0]).toBe("fetch origin");
  });

  it("a failed fetch can never report `fresh` (stale remote ref hazard)", () => {
    const { exec } = fakeGit({
      fetch: null,
      "rev-parse --verify": "7a3961d0a\n",
      "merge-base": "7a3961d0a\n",
      "rev-list --count": "0\n",
      "log -1": `${nowSeconds("2026-09-20T11:30:00Z")}\n`,
    });

    const result = assessWorktreeBase({ exec, now: () => NOW_MS });

    expect(result.state).toBe("unknown");
    expect(result.fresh).toBe(false);
  });

  it("an unresolvable origin/main is `unknown`, not `unrelated`", () => {
    const { exec } = fakeGit({ fetch: "", "rev-parse --verify": null });

    const result = assessWorktreeBase({ exec, now: () => NOW_MS });

    expect(result.state).toBe("unknown");
  });

  it("never throws when every git call fails", () => {
    const exec = () => {
      throw new Error("not a git repository");
    };

    expect(() => assessWorktreeBase({ exec })).not.toThrow();
    expect(assessWorktreeBase({ exec }).fresh).toBe(false);
  });

  it("skips the fetch when the caller already fetched", () => {
    const { exec, calls } = fakeGit({
      "rev-parse --verify": "7a3961d0a\n",
      "merge-base": "7a3961d0a\n",
      "rev-list --count": "0\n",
      "log -1": `${nowSeconds("2026-09-20T11:30:00Z")}\n`,
    });

    const result = assessWorktreeBase({ exec, fetch: false, now: () => NOW_MS });

    expect(calls.some((c) => c.startsWith("fetch"))).toBe(false);
    expect(result.state).toBe("fresh");
  });
});

// ---------------------------------------------------------------------------
// Wiring — a check nothing calls is the "decorative gate" failure this repo
// documents repeatedly. Same shape as the SKILL.md wiring tests in
// merge-queue-eligibility.test.mjs.
// ---------------------------------------------------------------------------

const CLI_CALL = "node scripts/worktree-base-freshness.mjs check";

describe("wiring (#5296)", () => {
  const WORKER_MD = readFileSync(resolve(ROOT, ".claude/agents/implement-queue-worker.md"), "utf8");
  const SKILL_MD = readFileSync(resolve(ROOT, ".claude/skills/implement-queue/SKILL.md"), "utf8");

  it("implement-queue-worker.md calls the check before any implementation work", () => {
    const checkAt = WORKER_MD.indexOf(CLI_CALL);
    const tddAt = WORKER_MD.indexOf("**TDD implementation**");

    expect(checkAt).toBeGreaterThan(-1);
    expect(tddAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(tddAt);
  });

  it("implement-queue-worker.md states the remediation verbatim", () => {
    expect(WORKER_MD).toContain(REMEDIATION);
  });

  it("implement-queue SKILL.md Phase 2 calls the check alongside the build-freshness check", () => {
    const phase2At = SKILL_MD.indexOf("## Phase 2");
    const phase3At = SKILL_MD.indexOf("## Phase 3");
    const checkAt = SKILL_MD.indexOf(CLI_CALL);

    expect(checkAt).toBeGreaterThan(phase2At);
    expect(checkAt).toBeLessThan(phase3At);
  });

  it("implement-queue SKILL.md states the remediation verbatim", () => {
    expect(SKILL_MD).toContain(REMEDIATION);
  });
});
