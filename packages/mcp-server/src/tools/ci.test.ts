import { describe, it, expect, vi } from "vitest";
import { ciRunStatus } from "./ci.js";

describe("ciRunStatus", () => {
  it("returns CI runs as formatted JSON string", async () => {
    const runs = [
      { name: "CI", status: "completed", conclusion: "success", workflowName: "CI" },
      { name: "Deploy", status: "in_progress", conclusion: null, workflowName: "Deploy" },
    ];
    const run = vi.fn().mockReturnValue(JSON.stringify(runs));

    const result = await ciRunStatus(run);

    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result) as typeof runs;
    expect(parsed).toHaveLength(2);
    expect(parsed[0].conclusion).toBe("success");
  });

  it("result can be used as MCP text content", async () => {
    const run = vi.fn().mockReturnValue("[]");

    const result = await ciRunStatus(run);
    const mcpContent = [{ type: "text" as const, text: result }];

    expect(mcpContent[0].type).toBe("text");
    expect(typeof mcpContent[0].text).toBe("string");
  });

  it("returns error JSON when runner returns error envelope", async () => {
    const envelope = JSON.stringify({
      error: "Failed to get CI status",
      message: "gh: command not found",
    });
    const run = vi.fn().mockReturnValue(envelope);

    const result = await ciRunStatus(run);
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get CI status");
    expect(parsed.message).toBe("gh: command not found");
  });

  it("returns error JSON when runner returns non-Error envelope", async () => {
    const envelope = JSON.stringify({
      error: "Failed to get CI status",
      message: "unexpected string error",
    });
    const run = vi.fn().mockReturnValue(envelope);

    const result = await ciRunStatus(run);
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get CI status");
    expect(parsed.message).toBe("unexpected string error");
  });

  it("parses JSON output from gh CLI", async () => {
    const runs = [{ name: "Test", status: "queued", conclusion: null, workflowName: "Test" }];
    const run = vi.fn().mockReturnValue(JSON.stringify(runs));

    const result = await ciRunStatus(run);
    const parsed = JSON.parse(result) as typeof runs;

    expect(parsed[0].status).toBe("queued");
    expect(parsed[0].workflowName).toBe("Test");
  });
});
