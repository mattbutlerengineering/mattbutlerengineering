import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process and fs
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  rm: vi.fn(),
}));

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  createWorktree,
  removeWorktree,
  commitChanges,
  hasChanges,
} from "../worktree-manager.js";

// Helper to set up promisified execFile mock
function setupExecFileMock(stdoutResponses: string[] = [""]) {
  let callIndex = 0;
  vi.mocked(execFile).mockImplementation(
    ((...args: unknown[]) => {
      const callback = args[args.length - 1];
      const stdout = stdoutResponses[callIndex] ?? "";
      callIndex++;
      if (typeof callback === "function") {
        (callback as (err: null, result: { stdout: string }) => void)(null, {
          stdout,
        });
      }
      return {} as ReturnType<typeof execFile>;
    }) as typeof execFile
  );
}

describe("createWorktree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a worktree with a generated branch name", async () => {
    setupExecFileMock([""]);

    const result = await createWorktree("/repo", "main", "Fix login bug");

    expect(result.branchName).toMatch(/^agent\/fix-login-bug-[a-f0-9]{6}$/);
    expect(result.path).toContain(".agent-worktrees");
    expect(execFile).toHaveBeenCalled();
  });

  it("generates branch names from task descriptions", async () => {
    setupExecFileMock([""]);

    const result = await createWorktree("/repo", "main", "Add user AUTH!!! Feature");

    expect(result.branchName).toMatch(/^agent\/add-user-auth-feature-[a-f0-9]{6}$/);
  });

  it("truncates long task descriptions in branch names", async () => {
    setupExecFileMock([""]);

    const longDesc = "A".repeat(100);
    const result = await createWorktree("/repo", "main", longDesc);

    // Branch name should be: "agent/" + slug (max 40) + "-" + 6 hex chars
    const slugPart = result.branchName.replace(/^agent\//, "").replace(/-[a-f0-9]{6}$/, "");
    expect(slugPart.length).toBeLessThanOrEqual(40);
  });
});

describe("removeWorktree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes an existing worktree", async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true);
    setupExecFileMock([""]);

    await removeWorktree("/repo", "/repo/.agent-worktrees/test");
    expect(execFile).toHaveBeenCalled();
  });

  it("skips removal if worktree does not exist", async () => {
    vi.mocked(existsSync).mockReturnValueOnce(false);

    await removeWorktree("/repo", "/repo/.agent-worktrees/nonexistent");
    expect(execFile).not.toHaveBeenCalled();
  });
});

describe("commitChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds and commits changes, returns SHA", async () => {
    setupExecFileMock(["", "M src/index.ts", "", "abc123"]);

    const sha = await commitChanges("/worktree", "feat: test commit");
    expect(sha).toBe("abc123");
  });

  it("returns empty string when there are no changes", async () => {
    setupExecFileMock(["", ""]);

    const sha = await commitChanges("/worktree", "feat: nothing");
    expect(sha).toBe("");
  });
});

describe("hasChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when there are changes", async () => {
    setupExecFileMock(["M src/index.ts"]);

    const result = await hasChanges("/worktree");
    expect(result).toBe(true);
  });

  it("returns false when there are no changes", async () => {
    setupExecFileMock([""]);

    const result = await hasChanges("/worktree");
    expect(result).toBe(false);
  });
});
