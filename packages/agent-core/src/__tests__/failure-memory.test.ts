import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  recordFailure,
  queryPastFailures,
  buildFailureContext,
  loadMemory,
} from "../failure-memory.js";
import type { FailureRecord, FailureMemory } from "../failure-memory.js";

const SAMPLE_RECORD: FailureRecord = {
  taskDescription: "Fix the login button styling",
  timestamp: "2026-03-29T10:00:00Z",
  stuckPattern: "repeated_action_observation",
  errors: ["Could not find login component"],
  approach: "Tried editing src/components/Login.tsx",
};

describe("recordFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it("creates a new memory file when none exists", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    await recordFailure("/repo", SAMPLE_RECORD);

    expect(writeFile).toHaveBeenCalledWith(
      "/repo/.agent-memory/failures.json",
      expect.stringContaining("Fix the login button styling")
    );
  });

  it("appends to existing records", async () => {
    const existing: FailureMemory = {
      records: [
        {
          taskDescription: "Old task",
          timestamp: "2026-03-28T10:00:00Z",
          errors: ["old error"],
          approach: "old approach",
        },
      ],
    };

    vi.mocked(readFile).mockResolvedValue(JSON.stringify(existing));

    await recordFailure("/repo", SAMPLE_RECORD);

    const written = JSON.parse(
      vi.mocked(writeFile).mock.calls[0][1] as string
    );
    expect(written.records).toHaveLength(2);
    expect(written.records[1].taskDescription).toBe("Fix the login button styling");
  });

  it("caps records at 100", async () => {
    const records: FailureRecord[] = Array.from({ length: 100 }, (_, i) => ({
      taskDescription: `Task ${i}`,
      timestamp: `2026-03-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      errors: [],
      approach: "",
    }));

    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ records }));

    await recordFailure("/repo", SAMPLE_RECORD);

    const written = JSON.parse(
      vi.mocked(writeFile).mock.calls[0][1] as string
    );
    expect(written.records).toHaveLength(100);
    expect(written.records[99].taskDescription).toBe("Fix the login button styling");
  });
});

describe("queryPastFailures", () => {
  const memory: FailureMemory = {
    records: [
      {
        taskDescription: "Fix the login button styling on the homepage",
        timestamp: "2026-03-28T10:00:00Z",
        errors: ["Component not found"],
        approach: "Edited Login.tsx",
      },
      {
        taskDescription: "Add user profile avatar upload",
        timestamp: "2026-03-27T10:00:00Z",
        errors: ["S3 permissions error"],
        approach: "Used presigned URLs",
      },
      {
        taskDescription: "Fix the login form validation errors",
        timestamp: "2026-03-26T10:00:00Z",
        stuckPattern: "repeated_error",
        errors: ["Zod schema mismatch"],
        approach: "Modified login schema",
      },
    ],
  };

  it("finds similar tasks by word overlap", () => {
    const results = queryPastFailures(memory, "Fix login button issues");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].taskDescription).toContain("login");
  });

  it("returns empty array for unrelated tasks", () => {
    const results = queryPastFailures(memory, "Deploy infrastructure changes");

    expect(results).toHaveLength(0);
  });

  it("respects maxResults", () => {
    const results = queryPastFailures(memory, "Fix login", 1);

    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("handles empty task description", () => {
    const results = queryPastFailures(memory, "");

    expect(results).toHaveLength(0);
  });
});

describe("buildFailureContext", () => {
  it("returns empty string for no failures", () => {
    const context = buildFailureContext([]);
    expect(context).toBe("");
  });

  it("builds context with stuck pattern and errors", () => {
    const context = buildFailureContext([SAMPLE_RECORD]);

    expect(context).toContain("Past Failure Context");
    expect(context).toContain("repeated_action_observation");
    expect(context).toContain("Could not find login component");
    expect(context).toContain("different approach");
  });
});

describe("loadMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty memory when file does not exist", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const memory = await loadMemory("/repo");

    expect(memory.records).toHaveLength(0);
  });

  it("parses existing memory file", async () => {
    const existing: FailureMemory = {
      records: [SAMPLE_RECORD],
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(existing));

    const memory = await loadMemory("/repo");

    expect(memory.records).toHaveLength(1);
    expect(memory.records[0].taskDescription).toBe("Fix the login button styling");
  });
});
