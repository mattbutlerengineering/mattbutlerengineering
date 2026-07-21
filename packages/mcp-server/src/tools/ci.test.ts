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
    const [first] = parsed;
    if (!first) throw new Error("expected at least one run");
    expect(first.conclusion).toBe("success");
  });

  it("result can be used as MCP text content", async () => {
    const run = vi.fn().mockReturnValue("[]");

    const result = await ciRunStatus(run);
    const mcpContent = [{ type: "text" as const, text: result }];

    const [entry] = mcpContent;
    if (!entry) throw new Error("expected at least one content entry");
    expect(entry.type).toBe("text");
    expect(typeof entry.text).toBe("string");
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

    const [first] = parsed;
    if (!first) throw new Error("expected at least one run");
    expect(first.status).toBe("queued");
    expect(first.workflowName).toBe("Test");
  });
});
