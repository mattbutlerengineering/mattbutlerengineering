import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { recordSpend, type SpendEntry } from "../spend-recorder.js";

describe("recordSpend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(mkdirSync).mockReturnValue(undefined);
    vi.mocked(appendFileSync).mockReturnValue(undefined);
  });

  it("appends exactly one JSONL entry to the canonical sink", () => {
    recordSpend("/repo", {
      costUsd: 0.45,
      issueNumber: 1234,
      model: "claude-sonnet-4-6",
      adapter: "claude",
      sessionId: "sess-abc",
      status: "succeeded",
    });

    expect(appendFileSync).toHaveBeenCalledTimes(1);
    const [path, content] = vi.mocked(appendFileSync).mock.calls[0] as [string, string];
    expect(path).toContain(".claude/agent-spend/sessions.jsonl");
    expect(path).not.toContain(".claude/agent-spend.jsonl");
    const entry = JSON.parse(content.trimEnd()) as SpendEntry;
    expect(entry.costUsd).toBe(0.45);
    expect(entry.issueNumber).toBe(1234);
    expect(entry.model).toBe("claude-sonnet-4-6");
    expect(entry.adapter).toBe("claude");
    expect(entry.sessionId).toBe("sess-abc");
    expect(entry.status).toBe("succeeded");
  });

  it("stamps both a YYYY-MM-DD date and an ISO timestamp", () => {
    recordSpend("/repo", { costUsd: 0.1 });

    const [, content] = vi.mocked(appendFileSync).mock.calls[0] as [string, string];
    const entry = JSON.parse(content.trimEnd()) as SpendEntry;
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.timestamp.startsWith(entry.date)).toBe(true);
  });

  it("populates token/turn attribution when provided (claude superset)", () => {
    recordSpend("/repo", {
      costUsd: 0.02,
      inputTokens: 1234,
      outputTokens: 567,
      numTurns: 7,
    });

    const [, content] = vi.mocked(appendFileSync).mock.calls[0] as [string, string];
    const entry = JSON.parse(content.trimEnd()) as SpendEntry;
    expect(entry.inputTokens).toBe(1234);
    expect(entry.outputTokens).toBe(567);
    expect(entry.numTurns).toBe(7);
  });

  it("records a visible entry for a cost-less adapter run (gemini/opencode)", () => {
    recordSpend("/repo", { costUsd: 0, adapter: "gemini", status: "succeeded" });

    expect(appendFileSync).toHaveBeenCalledTimes(1);
    const [, content] = vi.mocked(appendFileSync).mock.calls[0] as [string, string];
    const entry = JSON.parse(content.trimEnd()) as SpendEntry;
    expect(entry.costUsd).toBe(0);
    expect(entry.adapter).toBe("gemini");
    expect(entry.inputTokens).toBeUndefined();
    expect(entry.numTurns).toBeUndefined();
  });

  it("creates the .claude/agent-spend directory if it does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    recordSpend("/repo", { costUsd: 0.1 });

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining(".claude/agent-spend"), {
      recursive: true,
    });
    expect(appendFileSync).toHaveBeenCalledTimes(1);
  });

  it("allows null issueNumber when the run is not issue-scoped", () => {
    recordSpend("/repo", { costUsd: 0.05, issueNumber: null });

    const [, content] = vi.mocked(appendFileSync).mock.calls[0] as [string, string];
    const entry = JSON.parse(content.trimEnd()) as SpendEntry;
    expect(entry.issueNumber).toBeNull();
  });

  it("writes a newline-terminated JSON line", () => {
    recordSpend("/repo", { costUsd: 0.1 });

    const [, content] = vi.mocked(appendFileSync).mock.calls[0] as [string, string];
    expect(content).toMatch(/\n$/);
  });

  it("omits optional fields when not provided", () => {
    recordSpend("/repo", { costUsd: 0.2 });

    const [, content] = vi.mocked(appendFileSync).mock.calls[0] as [string, string];
    const entry = JSON.parse(content.trimEnd()) as SpendEntry;
    expect(entry.sessionId).toBeUndefined();
    expect(entry.model).toBeUndefined();
    expect(entry.adapter).toBeUndefined();
    expect(entry.issueNumber).toBeUndefined();
    expect(entry.status).toBeUndefined();
  });
});
