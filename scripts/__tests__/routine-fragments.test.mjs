import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BUILTIN_ROUTINE_NAMES,
  loadRoutineFragments,
  parseRoutineCatalog,
} from "../routine-manifest.mjs";

/** Frozen from origin/main. A new routine is scripts/routines/<name>.json. */
const BUILTIN_SNAPSHOT = [
  "mbe-deep-audit",
  "drift-fix",
  "metrics-collectors",
  "mbe-evening",
  "mbe-night",
  "mbe-auditor",
  "mbe-daily-issue",
  "mbe-morning",
  "mbe-learning-loop",
  "mbe-midday",
  "mbe-weekly-improve",
  "mbe-doc-rot",
  "mbe-weekly-retro",
  "mbe-monthly-meta-audit",
  "mbe-ui-quality",
  "mbe-feature-drain",
  "mbe-prune",
];

describe("builtin routine ratchet", () => {
  it("refuses a new name in the builtin array", () => {
    expect(
      BUILTIN_ROUTINE_NAMES,
      "add scripts/routines/<name>.json instead of extending the builtin array"
    ).toEqual(BUILTIN_SNAPSHOT);
  });
});

describe("loadRoutineFragments", () => {
  const dirs = [];

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function tempDir() {
    const dir = mkdtempSync(join(tmpdir(), "routine-fragments-"));
    dirs.push(dir);
    return dir;
  }

  it("returns an empty list when the directory does not exist", () => {
    expect(loadRoutineFragments(join(tmpdir(), "routine-fragments-missing"))).toEqual([]);
  });

  it("loads a fragment whose name is absent from a catalog", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "mbe-new.json"),
      JSON.stringify({
        name: "mbe-new",
        triggerId: null,
        periodDays: 1,
        signature: { type: "heartbeat" },
      })
    );
    expect(loadRoutineFragments(dir, []).map((entry) => entry.name)).toEqual(["mbe-new"]);
    const catalog = parseRoutineCatalog("| Routine |\n| --- |\n| `mbe-evening` | `trig` |");
    expect(catalog.map((row) => row.name)).not.toContain("mbe-new");
  });

  it("sorts fragments by filename and ignores non-json files", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "b-routine.json"),
      JSON.stringify({ name: "b-routine", periodDays: 1 })
    );
    writeFileSync(
      join(dir, "a-routine.json"),
      JSON.stringify({ name: "a-routine", periodDays: 7 })
    );
    writeFileSync(join(dir, "notes.txt"), "not a fragment");
    expect(loadRoutineFragments(dir, []).map((entry) => entry.name)).toEqual([
      "a-routine",
      "b-routine",
    ]);
  });

  it("throws when the filename stem does not equal name", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "mbe-new.json"), JSON.stringify({ name: "other", periodDays: 1 }));
    expect(() => loadRoutineFragments(dir, [])).toThrow(/filename must match the name field/);
  });

  it("throws when a fragment duplicates a reserved name", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "mbe-prune.json"),
      JSON.stringify({ name: "mbe-prune", periodDays: 1, signature: { type: "heartbeat" } })
    );
    expect(() => loadRoutineFragments(dir, ["mbe-prune"])).toThrow(
      /duplicate routine name mbe-prune/
    );
  });
});
