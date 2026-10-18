/**
 * Arm/disarm decision for dependabot-auto-merge.yml (review M1, #6577).
 *
 * #6577: auto-merge was armed on Dependabot's commit, then an unsigned
 * `mattbutlerengineering` commit and a merge of main landed on the PR, and the
 * armed auto-merge carried them into main. These pin that a foreign commit
 * (or a non-merge decision) disarms, and that only an all-Dependabot PR with a
 * merge decision arms.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideArmState,
  isDependabotCommit,
  allCommitsByDependabot,
} from "../dependabot-auto-merge-policy.mjs";

const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../dependabot-auto-merge-policy.mjs"
);

// Shapes measured from GET /repos/.../pulls/6577/commits on 2026-10-18.
const DEPENDABOT_COMMIT = {
  sha: "31b7603202",
  author: { login: "dependabot[bot]" },
  committer: { login: "web-flow" },
  commit: { verification: { verified: true, reason: "valid" } },
};
const HUMAN_FIX_COMMIT = {
  sha: "a2f3337a36",
  author: { login: "mattbutlerengineering" },
  committer: { login: "mattbutlerengineering" },
  commit: { verification: { verified: false, reason: "unsigned" } },
};

describe("isDependabotCommit", () => {
  it("accepts a GitHub-signed commit authored by dependabot[bot]", () => {
    expect(isDependabotCommit(DEPENDABOT_COMMIT)).toBe(true);
  });

  it("rejects the #6577 human fix commit", () => {
    expect(isDependabotCommit(HUMAN_FIX_COMMIT)).toBe(false);
  });

  it("rejects a dependabot-authored commit that is unsigned (spoofed author email)", () => {
    expect(
      isDependabotCommit({
        ...DEPENDABOT_COMMIT,
        commit: { verification: { verified: false, reason: "unsigned" } },
      })
    ).toBe(false);
  });

  it("rejects a dependabot-authored commit committed by someone else (amended/rebased locally)", () => {
    expect(
      isDependabotCommit({ ...DEPENDABOT_COMMIT, committer: { login: "mattbutlerengineering" } })
    ).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isDependabotCommit(null)).toBe(false);
    expect(isDependabotCommit({})).toBe(false);
  });
});

describe("allCommitsByDependabot", () => {
  it("true when every commit is Dependabot's", () => {
    expect(allCommitsByDependabot([DEPENDABOT_COMMIT])).toBe(true);
  });

  it("false when any commit is foreign (the #6577 shape)", () => {
    expect(allCommitsByDependabot([DEPENDABOT_COMMIT, HUMAN_FIX_COMMIT])).toBe(false);
  });

  it("flattens `gh api --paginate --slurp` pages", () => {
    expect(allCommitsByDependabot([[DEPENDABOT_COMMIT], [DEPENDABOT_COMMIT]])).toBe(true);
    expect(allCommitsByDependabot([[DEPENDABOT_COMMIT], [HUMAN_FIX_COMMIT]])).toBe(false);
  });

  it("fails closed on empty or non-array input", () => {
    expect(allCommitsByDependabot([])).toBe(false);
    expect(allCommitsByDependabot([[]])).toBe(false);
    expect(allCommitsByDependabot(null)).toBe(false);
    expect(allCommitsByDependabot({})).toBe(false);
  });
});

describe("decideArmState", () => {
  it("arms on merge + all-Dependabot commits when not yet armed", () => {
    expect(
      decideArmState({ decision: "merge", commitsByDependabot: true, autoMergeEnabled: false })
        .state
    ).toBe("arm");
  });

  it("is a noop on merge + all-Dependabot commits when already armed", () => {
    expect(
      decideArmState({ decision: "merge", commitsByDependabot: true, autoMergeEnabled: true }).state
    ).toBe("noop");
  });

  it("disarms an armed PR once a foreign commit lands, even if policy says merge (#6577)", () => {
    const d = decideArmState({
      decision: "merge",
      commitsByDependabot: false,
      autoMergeEnabled: true,
    });
    expect(d.state).toBe("disarm");
    expect(d.reason).toMatch(/not authored by Dependabot/);
  });

  it("disarms an armed PR when the policy no longer decides merge", () => {
    const d = decideArmState({
      decision: "manual",
      commitsByDependabot: true,
      autoMergeEnabled: true,
    });
    expect(d.state).toBe("disarm");
  });

  it("disarms an armed PR when no decision was made (foreign-actor run)", () => {
    expect(
      decideArmState({ decision: "", commitsByDependabot: true, autoMergeEnabled: true }).state
    ).toBe("disarm");
  });

  it("is a noop (idempotent) when it would disarm but nothing is armed", () => {
    expect(
      decideArmState({ decision: "manual", commitsByDependabot: false, autoMergeEnabled: false })
        .state
    ).toBe("noop");
  });

  it("fails closed on non-boolean inputs (never arms on a truthy string)", () => {
    expect(
      decideArmState({ decision: "merge", commitsByDependabot: "true", autoMergeEnabled: false })
        .state
    ).toBe("noop");
  });
});

describe("arm-state CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "arm-state-"));
  const writeCommits = (name, value) => {
    const p = join(dir, name);
    writeFileSync(p, JSON.stringify(value));
    return p;
  };
  const run = (...args) =>
    JSON.parse(execFileSync("node", [SCRIPT, "arm-state", ...args], { encoding: "utf8" }));

  it("arms for an all-Dependabot PR with a merge decision", () => {
    const file = writeCommits("ok.json", [[DEPENDABOT_COMMIT]]);
    const out = run("--decision", "merge", "--commits-file", file, "--auto-merge-enabled", "false");
    expect(out.state).toBe("arm");
  });

  it("disarms the #6577 shape", () => {
    const file = writeCommits("foreign.json", [[DEPENDABOT_COMMIT, HUMAN_FIX_COMMIT]]);
    const out = run("--decision", "merge", "--commits-file", file, "--auto-merge-enabled", "true");
    expect(out.state).toBe("disarm");
  });

  it("fails closed (disarm) when the commits file is missing", () => {
    const out = run(
      "--decision",
      "merge",
      "--commits-file",
      join(dir, "does-not-exist.json"),
      "--auto-merge-enabled",
      "true"
    );
    expect(out.state).toBe("disarm");
  });
});
