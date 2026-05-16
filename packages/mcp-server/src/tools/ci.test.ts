import { describe, it, expect, vi, beforeEach } from "vitest";
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { ciRunStatus } from "./ci.js";

describe("ciRunStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns CI runs as formatted JSON string", async () => {
    const runs = [
      { name: "CI", status: "completed", conclusion: "success", workflowName: "CI" },
      { name: "Deploy", status: "in_progress", conclusion: null, workflowName: "Deploy" },
    ];
    vi.mocked(execSync).mockReturnValue(JSON.stringify(runs));

    const result = await ciRunStatus();

    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result) as typeof runs;
    expect(parsed).toHaveLength(2);
    expect(parsed[0].conclusion).toBe("success");
  });

  it("result can be used as MCP text content", async () => {
    vi.mocked(execSync).mockReturnValue("[]");

    const result = await ciRunStatus();
    const mcpContent = [{ type: "text" as const, text: result }];

    expect(mcpContent[0].type).toBe("text");
    expect(typeof mcpContent[0].text).toBe("string");
  });

  it("returns error JSON when execSync throws an Error", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("gh: command not found");
    });

    const result = await ciRunStatus();
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get CI status");
    expect(parsed.message).toBe("gh: command not found");
  });

  it("returns error JSON when non-Error is thrown", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw "unexpected string error";
    });

    const result = await ciRunStatus();
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get CI status");
    expect(parsed.message).toBe("unexpected string error");
  });

  it("parses JSON output from gh CLI", async () => {
    const runs = [{ name: "Test", status: "queued", conclusion: null, workflowName: "Test" }];
    vi.mocked(execSync).mockReturnValue(JSON.stringify(runs));

    const result = await ciRunStatus();
    const parsed = JSON.parse(result) as typeof runs;

    expect(parsed[0].status).toBe("queued");
    expect(parsed[0].workflowName).toBe("Test");
  });
});
