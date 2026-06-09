import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSuite } from "./golden-task-set.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eval-suite-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const validTask = {
  id: "fix-login",
  category: "bugfix",
  prompt: "Fix the login redirect bug",
  fixtureRef: "fixtures/fix-login",
};

describe("loadSuite", () => {
  it("loads and validates a well-formed task (applying schema defaults)", async () => {
    await writeFile(join(dir, "fix-login.json"), JSON.stringify(validTask));

    const tasks = await loadSuite(dir);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("fix-login");
    // defaults applied
    expect(tasks[0].rubric.testsMustPass).toBe(true);
    expect(tasks[0].budget.maxTurns).toBe(50);
  });

  it("rejects a task with an invalid category", async () => {
    await writeFile(join(dir, "bad.json"), JSON.stringify({ ...validTask, category: "nonsense" }));

    await expect(loadSuite(dir)).rejects.toThrow(/Invalid eval task/);
  });

  it("rejects malformed JSON with a sourced error", async () => {
    await writeFile(join(dir, "broken.json"), "{ not json");

    await expect(loadSuite(dir)).rejects.toThrow(/Invalid JSON in eval task/);
  });

  it("rejects duplicate task ids", async () => {
    await writeFile(join(dir, "a.json"), JSON.stringify(validTask));
    await writeFile(join(dir, "b.json"), JSON.stringify(validTask));

    await expect(loadSuite(dir)).rejects.toThrow(/Duplicate task id/);
  });

  it("throws a clear error when the directory does not exist", async () => {
    await expect(loadSuite(join(dir, "missing"))).rejects.toThrow(/Could not read eval suite directory/);
  });

  it("ignores non-JSON files", async () => {
    await writeFile(join(dir, "fix-login.json"), JSON.stringify(validTask));
    await writeFile(join(dir, "README.md"), "# not a task");

    const tasks = await loadSuite(dir);
    expect(tasks).toHaveLength(1);
  });
});
