import { describe, it, expect } from "vitest";
import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NAMED_SUITES } from "../cost-suite.js";

// The real, git-tracked eval-suite directory (not a temp fixture) —
// packages/agent-core/eval-suite, three levels up from this test file
// (__tests__ -> eval -> src -> agent-core root).
const EVAL_SUITE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../eval-suite");

describe("eval-suite subdirectory registration", () => {
  it("has a registered named suite for every subdirectory containing *.json tasks", async () => {
    // loadSuite only reads *.json files at the top level of a suite directory
    // (it does not recurse — see eval-suite/README.md). A subdirectory of
    // task files is only ever run if it's wired up as its own named suite
    // (e.g. "cost" -> COST_SUITE_DIR); otherwise it's a task that's checked
    // in, valid, and never runs.
    const registeredDirNames = new Set(Object.keys(NAMED_SUITES));
    const entries = await readdir(EVAL_SUITE_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const files = await readdir(join(EVAL_SUITE_DIR, entry.name));
      const hasTasks = files.some((f) => f.endsWith(".json"));
      if (!hasTasks) continue;
      expect(
        registeredDirNames,
        `eval-suite/${entry.name} has *.json tasks but no matching named-suite registration`
      ).toContain(entry.name);
    }
  });
});
