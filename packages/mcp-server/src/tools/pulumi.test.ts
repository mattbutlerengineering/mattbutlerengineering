import { describe, it, expect, vi, beforeEach } from "vitest";
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { pulumiStackOutputs } from "./pulumi.js";

describe("pulumiStackOutputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns raw stack output string from pulumi CLI", async () => {
    const outputs = JSON.stringify({
      apiUrl: "https://api.example.com",
      dbHost: "db.example.com",
    });
    vi.mocked(execSync).mockReturnValue(outputs);

    const result = await pulumiStackOutputs();

    expect(result).toBe(outputs);
  });

  it("passes the correct pulumi command to execSync", async () => {
    vi.mocked(execSync).mockReturnValue("{}");

    await pulumiStackOutputs();

    expect(vi.mocked(execSync)).toHaveBeenCalledWith(
      "pulumi stack output --json",
      expect.objectContaining({ encoding: "utf-8", timeout: 30000 })
    );
  });

  it("result can be used directly as MCP text content", async () => {
    const outputs = '{"key": "value"}';
    vi.mocked(execSync).mockReturnValue(outputs);

    const result = await pulumiStackOutputs();
    const mcpContent = [{ type: "text" as const, text: result }];

    expect(mcpContent[0].type).toBe("text");
    expect(mcpContent[0].text).toBe(outputs);
  });

  it("returns error JSON when pulumi command fails", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("pulumi: stack not found");
    });

    const result = await pulumiStackOutputs();
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get Pulumi outputs");
    expect(parsed.message).toBe("pulumi: stack not found");
  });

  it("returns error JSON when non-Error is thrown", async () => {
    vi.mocked(execSync).mockImplementation(() => {
       
      throw "exit code 1";
    });

    const result = await pulumiStackOutputs();
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get Pulumi outputs");
    expect(parsed.message).toBe("exit code 1");
  });

  it("handles empty stack output", async () => {
    vi.mocked(execSync).mockReturnValue("{}");

    const result = await pulumiStackOutputs();

    expect(result).toBe("{}");
  });

  it("applies 30 second timeout to pulumi command", async () => {
    vi.mocked(execSync).mockReturnValue("{}");

    await pulumiStackOutputs();

    expect(vi.mocked(execSync)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 30000 })
    );
  });
});
