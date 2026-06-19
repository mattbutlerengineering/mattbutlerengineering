import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { recordSessionCost, type CostEntry } from "../cost-logger.js";

describe("recordSessionCost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(mkdirSync).mockReturnValue(undefined);
    vi.mocked(appendFileSync).mockReturnValue(undefined);
  });

  it("appends a JSONL entry with required fields", () => {
    recordSessionCost("/repo", {
      costUsd: 0.45,
      issueNumber: 1234,
      model: "claude-sonnet-4-6",
      sessionId: "sess-abc",
      status: "succeeded",
    });

    expect(appendFileSync).toHaveBeenCalledTimes(1);
    const [path, content] = vi.mocked(appendFileSync).mock.calls[0] as [string, string];
    expect(path).toContain(".claude/agent-spend/sessions.jsonl");
    const entry = JSON.parse(content.trimEnd()) as CostEntry;
    expect(entry.costUsd).toBe(0.45);
    expect(entry.issueNumber).toBe(1234);
    expect(entry.model).toBe("claude-sonnet-4-6");
    expect(entry.sessionId).toBe("sess-abc");
    expect(entry.status).toBe("succeeded");
    expect(typeof entry.timestamp).toBe("string");
  });

  it("creates the .claude/agent-spend directory if it does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    recordSessionCost("/repo", { costUsd: 0.1 });

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining(".claude/agent-spend"), {
      recursive: true,
    });
    expect(appendFileSync).toHaveBeenCalledTimes(1);
  });

  it("allows null issueNumber when session has no associated issue", () => {
    recordSessionCost("/repo", { costUsd: 0.05, issueNumber: null });

    const [, content] = vi.mocked(appendFileSync).mock.calls[0] as [string, string];
    const entry = JSON.parse(content.trimEnd()) as CostEntry;
    expect(entry.issueNumber).toBeNull();
  });

  it("writes a newline-terminated JSON line", () => {
    recordSessionCost("/repo", { costUsd: 0.1 });

    const [, content] = vi.mocked(appendFileSync).mock.calls[0] as [string, string];
    expect(content).toMatch(/\n$/);
  });

  it("omits optional fields when not provided", () => {
    recordSessionCost("/repo", { costUsd: 0.2 });

    const [, content] = vi.mocked(appendFileSync).mock.calls[0] as [string, string];
    const entry = JSON.parse(content.trimEnd()) as CostEntry;
    expect(entry.sessionId).toBeUndefined();
    expect(entry.model).toBeUndefined();
    expect(entry.issueNumber).toBeUndefined();
    expect(entry.status).toBeUndefined();
  });
});
