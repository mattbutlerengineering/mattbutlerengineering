import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { PULUMI_PROJECT_DIR, pulumiStackOutputs } from "./pulumi.js";

describe("pulumiStackOutputs", () => {
  it("returns raw stack output string from pulumi CLI", async () => {
    const outputs = JSON.stringify({
      apiUrl: "https://api.example.com",
      dbHost: "db.example.com",
    });
    const run = vi.fn().mockReturnValue(outputs);

    const result = await pulumiStackOutputs(run);

    expect(result).toBe(outputs);
  });

  it("calls run with the correct pulumi command", async () => {
    const run = vi.fn().mockReturnValue("{}");

    await pulumiStackOutputs(run);

    const args = run.mock.calls[0]?.[0] as string[];
    expect(args).toEqual([
      "-C",
      PULUMI_PROJECT_DIR,
      "stack",
      "output",
      "--json",
      "--stack",
      "prod",
    ]);
  });

  it("resolves the Pulumi project dir to a real directory holding Pulumi.yaml", () => {
    expect(isAbsolute(PULUMI_PROJECT_DIR)).toBe(true);
    expect(existsSync(join(PULUMI_PROJECT_DIR, "Pulumi.yaml"))).toBe(true);
  });

  it("result can be used directly as MCP text content", async () => {
    const outputs = '{"key": "value"}';
    const run = vi.fn().mockReturnValue(outputs);

    const result = await pulumiStackOutputs(run);
    const mcpContent = [{ type: "text" as const, text: result }];

    const [entry] = mcpContent;
    if (!entry) throw new Error("expected at least one content entry");
    expect(entry.type).toBe("text");
    expect(entry.text).toBe(outputs);
  });

  it("returns error JSON when pulumi command fails", async () => {
    const envelope = JSON.stringify({
      error: "Failed to get Pulumi outputs",
      message: "pulumi: stack not found",
    });
    const run = vi.fn().mockReturnValue(envelope);

    const result = await pulumiStackOutputs(run);
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get Pulumi outputs");
    expect(parsed.message).toBe("pulumi: stack not found");
  });

  it("returns error JSON when non-Error is thrown", async () => {
    const envelope = JSON.stringify({
      error: "Failed to get Pulumi outputs",
      message: "exit code 1",
    });
    const run = vi.fn().mockReturnValue(envelope);

    const result = await pulumiStackOutputs(run);
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get Pulumi outputs");
    expect(parsed.message).toBe("exit code 1");
  });

  it("handles empty stack output", async () => {
    const run = vi.fn().mockReturnValue("{}");

    const result = await pulumiStackOutputs(run);

    expect(result).toBe("{}");
  });
});
