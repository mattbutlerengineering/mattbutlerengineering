/**
 * metrics-data.mjs moves telemetry off `main` onto the orphan `metrics-data`
 * branch, so a metric write is a direct push: no PR, no CI run. These tests
 * drive real git against a throwaway bare remote, because the behavior that
 * matters (two writers racing to push) only exists in real git.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DATA_BRANCH,
  DATA_DIRNAME,
  dataDir,
  pullDataBranch,
  pushDataBranch,
  bootstrapDataBranch,
  createRunGit,
} from "../metrics-data.mjs";

const quiet = () => {};

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

function identity(cwd) {
  git(cwd, ["config", "user.email", "test@example.com"]);
  git(cwd, ["config", "user.name", "test"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  git(cwd, ["config", "core.hooksPath", "/dev/null"]);
}

/** A bare remote plus a clone with one commit on main and a metrics/ tree. */
function makeRepo(base, name) {
  const clone = join(base, name);
  git(base, ["clone", "-q", join(base, "remote.git"), clone]);
  identity(clone);
  return clone;
}

let base;
let first;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "metrics-data-"));
  git(base, ["init", "-q", "--bare", "-b", "main", "remote.git"]);
  first = makeRepo(base, "first");
  execFileSync("mkdir", ["-p", join(first, "metrics", "production-health")]);
  writeFileSync(join(first, "metrics", "queue-telemetry.jsonl"), '{"n":1}\n');
  writeFileSync(join(first, "metrics", "production-health", "2026-11-24.jsonl"), '{"h":1}\n');
  writeFileSync(join(first, "metrics", "ai-antipattern-baselines.json"), "{}\n");
  git(first, ["add", "-A"]);
  git(first, ["commit", "-q", "-m", "init"]);
  git(first, ["push", "-q", "origin", "main"]);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

const DATA_PATHS = ["metrics/production-health/", "metrics/queue-telemetry.jsonl"];

describe("bootstrapDataBranch", () => {
  it("creates an orphan branch holding only the data paths, at the branch root", () => {
    bootstrapDataBranch({
      root: first,
      paths: DATA_PATHS,
      runGit: createRunGit(first),
      log: quiet,
    });

    const tree = git(first, ["ls-tree", "-r", "--name-only", `origin/${DATA_BRANCH}`])
      .trim()
      .split("\n")
      .sort();
    expect(tree).toEqual([
      ".gitattributes",
      "production-health/2026-11-24.jsonl",
      "queue-telemetry.jsonl",
    ]);
    // Orphan: no shared history with main.
    expect(git(first, ["rev-list", "--count", `origin/${DATA_BRANCH}`]).trim()).toBe("1");
  });

  it("marks jsonl as merge=union so racing appends rebase cleanly", () => {
    bootstrapDataBranch({
      root: first,
      paths: DATA_PATHS,
      runGit: createRunGit(first),
      log: quiet,
    });
    const attrs = git(first, ["show", `origin/${DATA_BRANCH}:.gitattributes`]);
    expect(attrs).toMatch(/^\*\.jsonl merge=union$/m);
  });

  it("refuses to overwrite a data branch that already exists on the remote", () => {
    bootstrapDataBranch({
      root: first,
      paths: DATA_PATHS,
      runGit: createRunGit(first),
      log: quiet,
    });
    expect(() =>
      bootstrapDataBranch({
        root: first,
        paths: DATA_PATHS,
        runGit: createRunGit(first),
        log: quiet,
      })
    ).toThrow(/already exists/);
  });
});

describe("pullDataBranch", () => {
  beforeEach(() => {
    bootstrapDataBranch({
      root: first,
      paths: DATA_PATHS,
      runGit: createRunGit(first),
      log: quiet,
    });
  });

  it("checks the data branch out at <root>/.metrics-data", () => {
    const second = makeRepo(base, "second");
    pullDataBranch({ root: second, runGit: createRunGit(second), log: quiet });
    expect(dataDir(second)).toBe(join(second, DATA_DIRNAME));
    expect(readFileSync(join(second, DATA_DIRNAME, "queue-telemetry.jsonl"), "utf-8")).toBe(
      '{"n":1}\n'
    );
  });

  it("fast-forwards an existing checkout to the remote tip", () => {
    const second = makeRepo(base, "second");
    pullDataBranch({ root: second, runGit: createRunGit(second), log: quiet });

    pullDataBranch({ root: first, runGit: createRunGit(first), log: quiet });
    appendFileSync(join(first, DATA_DIRNAME, "queue-telemetry.jsonl"), '{"n":2}\n');
    pushDataBranch({ root: first, message: "add n2", runGit: createRunGit(first), log: quiet });

    pullDataBranch({ root: second, runGit: createRunGit(second), log: quiet });
    expect(readFileSync(join(second, DATA_DIRNAME, "queue-telemetry.jsonl"), "utf-8")).toBe(
      '{"n":1}\n{"n":2}\n'
    );
  });

  it("works in a second worktree of a clone that already has a checkout", () => {
    // Local sessions run in many worktrees of one clone. A branch can be
    // checked out in only one worktree, so the data checkout must be detached.
    pullDataBranch({ root: first, runGit: createRunGit(first), log: quiet });
    const sibling = join(base, "first-sibling");
    git(first, ["worktree", "add", "-q", "--detach", sibling]);
    pullDataBranch({ root: sibling, runGit: createRunGit(sibling), log: quiet });
    appendFileSync(join(sibling, DATA_DIRNAME, "queue-telemetry.jsonl"), '{"n":"s"}\n');
    const result = pushDataBranch({
      root: sibling,
      message: "from sibling",
      runGit: createRunGit(sibling),
      log: quiet,
    });
    expect(result.pushed).toBe(true);
  });

  it("works in a single-branch clone, whose fetch refspec covers only main", () => {
    // `git clone --single-branch` (also implied by --depth) maps only main to
    // origin/*, so a bare `git fetch origin metrics-data` never creates
    // origin/metrics-data. Cloud sessions may clone this way.
    const single = join(base, "single");
    git(base, [
      "clone",
      "-q",
      "--single-branch",
      "--branch",
      "main",
      join(base, "remote.git"),
      single,
    ]);
    identity(single);
    pullDataBranch({ root: single, runGit: createRunGit(single), log: quiet });
    appendFileSync(join(single, DATA_DIRNAME, "queue-telemetry.jsonl"), '{"n":"single"}\n');
    expect(
      pushDataBranch({ root: single, message: "single", runGit: createRunGit(single), log: quiet })
        .pushed
    ).toBe(true);
  });

  it("refuses to pull over uncommitted metric writes", () => {
    pullDataBranch({ root: first, runGit: createRunGit(first), log: quiet });
    appendFileSync(join(first, DATA_DIRNAME, "queue-telemetry.jsonl"), '{"n":2}\n');
    expect(() => pullDataBranch({ root: first, runGit: createRunGit(first), log: quiet })).toThrow(
      /uncommitted/i
    );
  });
});

describe("pushDataBranch", () => {
  beforeEach(() => {
    bootstrapDataBranch({
      root: first,
      paths: DATA_PATHS,
      runGit: createRunGit(first),
      log: quiet,
    });
  });

  it("is a no-op when nothing changed", () => {
    pullDataBranch({ root: first, runGit: createRunGit(first), log: quiet });
    const result = pushDataBranch({
      root: first,
      message: "nothing",
      runGit: createRunGit(first),
      log: quiet,
    });
    expect(result).toEqual({ pushed: false, attempts: 0 });
  });

  it("lands both appends when two writers race from the same base", () => {
    const second = makeRepo(base, "second");
    pullDataBranch({ root: first, runGit: createRunGit(first), log: quiet });
    pullDataBranch({ root: second, runGit: createRunGit(second), log: quiet });

    appendFileSync(join(first, DATA_DIRNAME, "queue-telemetry.jsonl"), '{"n":"a"}\n');
    appendFileSync(join(second, DATA_DIRNAME, "queue-telemetry.jsonl"), '{"n":"b"}\n');

    pushDataBranch({ root: first, message: "a", runGit: createRunGit(first), log: quiet });
    const result = pushDataBranch({
      root: second,
      message: "b",
      runGit: createRunGit(second),
      log: quiet,
    });

    expect(result.pushed).toBe(true);
    expect(result.attempts).toBe(2);
    git(first, ["fetch", "-q", "origin", DATA_BRANCH]);
    const rows = git(first, ["show", `origin/${DATA_BRANCH}:queue-telemetry.jsonl`]);
    expect(rows.trim().split("\n").sort()).toEqual(['{"n":"a"}', '{"n":"b"}', '{"n":1}'].sort());
  });

  it("keeps the newer write when two writers rewrite the same JSON file", () => {
    const second = makeRepo(base, "second");
    pullDataBranch({ root: first, runGit: createRunGit(first), log: quiet });
    pullDataBranch({ root: second, runGit: createRunGit(second), log: quiet });

    writeFileSync(join(first, DATA_DIRNAME, "review-burden.json"), '{"v":"a"}\n');
    pushDataBranch({ root: first, message: "a", runGit: createRunGit(first), log: quiet });
    pullDataBranch({ root: first, runGit: createRunGit(first), log: quiet });
    writeFileSync(join(first, DATA_DIRNAME, "review-burden.json"), '{"v":"a2"}\n');
    writeFileSync(join(second, DATA_DIRNAME, "review-burden.json"), '{"v":"b"}\n');

    pushDataBranch({ root: first, message: "a2", runGit: createRunGit(first), log: quiet });
    pushDataBranch({ root: second, message: "b", runGit: createRunGit(second), log: quiet });

    git(first, ["fetch", "-q", "origin", DATA_BRANCH]);
    expect(git(first, ["show", `origin/${DATA_BRANCH}:review-burden.json`])).toBe('{"v":"b"}\n');
  });

  it("gives up after maxAttempts rejected pushes", () => {
    pullDataBranch({ root: first, runGit: createRunGit(first), log: quiet });
    appendFileSync(join(first, DATA_DIRNAME, "queue-telemetry.jsonl"), '{"n":2}\n');
    const real = createRunGit(first);
    const alwaysRejected = (args) => {
      if (args.includes("push")) throw new Error("rejected (fetch first)");
      return real(args);
    };
    expect(() =>
      pushDataBranch({
        root: first,
        message: "x",
        runGit: alwaysRejected,
        maxAttempts: 3,
        log: quiet,
      })
    ).toThrow(/after 3 attempts/);
  });

  it("fails with a pointer to pull when the checkout is missing", () => {
    const fresh = makeRepo(base, "fresh");
    expect(() =>
      pushDataBranch({ root: fresh, message: "x", runGit: createRunGit(fresh), log: quiet })
    ).toThrow(/metrics-data\.mjs pull/);
  });
});
