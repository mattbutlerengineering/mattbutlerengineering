/**
 * Covers #3645: persisting a routine's durable metrics used to be an
 * enumerated three-path `git add` inside a RemoteTrigger prompt that lives
 * outside version control. Adding a durable metric silently failed to persist
 * until someone remembered to edit the prompt. The path list now comes from
 * durableManifest(), so the prompt never needs to change again.
 */
import { describe, it, expect } from "vitest";
import {
  selectDurableDiffs,
  parseChangedPaths,
  buildBranchName,
  buildCommitMessage,
  assertRoutineName,
  persistMetrics,
} from "../persist-metrics.mjs";

const PATHS = [
  ".claude/improvement-loop/log.md",
  "metrics/process-metrics.jsonl",
  "metrics/production-health/",
  "metrics/queue-telemetry.jsonl",
];

describe("selectDurableDiffs", () => {
  it("keeps only changed paths the manifest declares durable", () => {
    const changed = ["metrics/queue-telemetry.jsonl", "packages/rialto/src/Button.tsx"];
    expect(selectDurableDiffs(PATHS, changed)).toEqual(["metrics/queue-telemetry.jsonl"]);
  });

  it("matches files inside a durable directory entry", () => {
    expect(selectDurableDiffs(PATHS, ["metrics/production-health/2026-08-03.jsonl"])).toEqual([
      "metrics/production-health/2026-08-03.jsonl",
    ]);
  });

  it("does not match a sibling that merely shares the directory's prefix", () => {
    expect(selectDurableDiffs(PATHS, ["metrics/production-health-notes.md"])).toEqual([]);
  });

  it("returns a sorted, de-duplicated list", () => {
    const changed = [
      "metrics/queue-telemetry.jsonl",
      ".claude/improvement-loop/log.md",
      "metrics/queue-telemetry.jsonl",
    ];
    expect(selectDurableDiffs(PATHS, changed)).toEqual([
      ".claude/improvement-loop/log.md",
      "metrics/queue-telemetry.jsonl",
    ]);
  });
});

describe("parseChangedPaths", () => {
  it("reads paths out of git status --porcelain output", () => {
    const porcelain = [" M metrics/queue-telemetry.jsonl", "?? metrics/verifications.jsonl"].join(
      "\n"
    );
    expect(parseChangedPaths(porcelain)).toEqual([
      "metrics/queue-telemetry.jsonl",
      "metrics/verifications.jsonl",
    ]);
  });

  it("unquotes a renamed entry to its destination path", () => {
    expect(parseChangedPaths("R  metrics/old.jsonl -> metrics/new.jsonl")).toEqual([
      "metrics/new.jsonl",
    ]);
  });

  it("returns [] for empty output", () => {
    expect(parseChangedPaths("")).toEqual([]);
    expect(parseChangedPaths("\n  \n")).toEqual([]);
  });
});

describe("naming", () => {
  it("builds a routine-scoped branch and conventional commit subject", () => {
    expect(buildBranchName("learning-loop", "2026-08-03")).toBe("metrics/learning-loop-2026-08-03");
    expect(buildCommitMessage("learning-loop", "2026-08-03")).toBe(
      "chore(metrics): learning-loop 2026-08-03"
    );
  });

  it("rejects a routine name that is not a plain slug", () => {
    expect(() => assertRoutineName("learning loop")).toThrow(/routine/i);
    expect(() => assertRoutineName("../../etc/passwd")).toThrow(/routine/i);
    expect(() => assertRoutineName("")).toThrow(/routine/i);
    expect(() => assertRoutineName("learning-loop")).not.toThrow();
  });
});

describe("persistMetrics", () => {
  const collect = () => {
    const git = [];
    const gh = [];
    return { git, gh, runGit: (a) => git.push(a), runGh: (a) => gh.push(a) };
  };

  it("exits without a commit when no durable path changed", () => {
    const { git, gh, runGit, runGh } = collect();

    const result = persistMetrics({
      routine: "learning-loop",
      today: "2026-08-03",
      paths: PATHS,
      listChanged: () => ["packages/rialto/src/Button.tsx"],
      runGit,
      runGh,
      log: () => {},
    });

    expect(result).toEqual({ committed: false, paths: [] });
    expect(git).toEqual([]);
    expect(gh).toEqual([]);
  });

  it("stages exactly the durable paths with a diff", () => {
    const { git, runGit, runGh } = collect();

    persistMetrics({
      routine: "learning-loop",
      today: "2026-08-03",
      paths: PATHS,
      listChanged: () => [
        "metrics/queue-telemetry.jsonl",
        "packages/rialto/src/Button.tsx",
        ".claude/improvement-loop/log.md",
      ],
      runGit,
      runGh,
      log: () => {},
    });

    const add = git.find((args) => args[0] === "add");
    expect(add).toEqual([
      "add",
      "--",
      ".claude/improvement-loop/log.md",
      "metrics/queue-telemetry.jsonl",
    ]);
  });

  it("branches, commits and opens a PR against main", () => {
    const { git, gh, runGit, runGh } = collect();

    const result = persistMetrics({
      routine: "learning-loop",
      today: "2026-08-03",
      paths: PATHS,
      listChanged: () => ["metrics/queue-telemetry.jsonl"],
      runGit,
      runGh,
      log: () => {},
    });

    expect(result.committed).toBe(true);
    expect(git[0]).toEqual(["checkout", "-b", "metrics/learning-loop-2026-08-03"]);
    expect(git).toContainEqual(["commit", "-m", "chore(metrics): learning-loop 2026-08-03"]);
    expect(gh).toHaveLength(1);
    expect(gh[0]).toContain("--base");
    expect(gh[0][gh[0].indexOf("--base") + 1]).toBe("main");
    expect(gh[0]).toContain("has-pr");
  });

  it("never passes a shell string — every argument is its own argv element", () => {
    const { git, gh, runGit, runGh } = collect();

    persistMetrics({
      routine: "learning-loop",
      today: "2026-08-03",
      paths: PATHS,
      listChanged: () => ["metrics/queue-telemetry.jsonl"],
      runGit,
      runGh,
      log: () => {},
    });

    for (const args of [...git, ...gh]) {
      expect(Array.isArray(args)).toBe(true);
      for (const arg of args) expect(typeof arg).toBe("string");
    }
  });
});
