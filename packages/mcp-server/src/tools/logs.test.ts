import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGlob = vi.hoisted(() => vi.fn<(pattern: string) => Promise<string[]>>());
const mockReadFile = vi.hoisted(() => vi.fn<() => Promise<string>>());

vi.mock("glob", () => ({
  glob: mockGlob,
}));

vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
}));

import { checkLogs } from "./logs.js";

describe("checkLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'No log files found.' when glob finds no files", async () => {
    mockGlob.mockResolvedValue([]);

    const result = await checkLogs();

    expect(result).toBe("No log files found.");
  });

  it("returns 'No log files found.' when called with a service and no files found", async () => {
    mockGlob.mockResolvedValue([]);

    const result = await checkLogs("users");

    expect(result).toBe("No log files found.");
  });

  it("passes service name into glob path when service is provided", async () => {
    mockGlob.mockResolvedValue([]);

    await checkLogs("users");

    const calledWith = mockGlob.mock.calls[0]?.[0] as string;
    expect(calledWith).toContain("users");
  });

  it("uses wildcard glob path when no service is provided", async () => {
    mockGlob.mockResolvedValue([]);

    await checkLogs();

    const calledWith = mockGlob.mock.calls[0]?.[0] as string;
    expect(calledWith).toContain("*");
  });

  it("returns formatted log content for found files", async () => {
    mockGlob.mockResolvedValue(["services/users/logs/app.log"]);
    mockReadFile.mockResolvedValue(
      "2024-01-01 info: server started\n2024-01-01 info: request received\n"
    );

    const result = await checkLogs();

    expect(result).toContain("Recent Logs:");
    expect(result).toContain("services/users/logs/app.log");
    expect(result).toContain("server started");
  });

  it("limits output to the last 20 lines per file", async () => {
    mockGlob.mockResolvedValue(["services/users/logs/app.log"]);
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
    mockReadFile.mockResolvedValue(lines);

    const result = await checkLogs();

    expect(result).toContain("line 30");
    expect(result).toContain("line 11");
    expect(result).not.toContain("line 1\n");
  });

  it("reads at most 3 files when more are available", async () => {
    const files = [
      "services/users/logs/app1.log",
      "services/users/logs/app2.log",
      "services/users/logs/app3.log",
      "services/users/logs/app4.log",
    ];
    mockGlob.mockResolvedValue(files);
    mockReadFile.mockResolvedValue("log line\n");

    await checkLogs();

    expect(mockReadFile).toHaveBeenCalledTimes(3);
  });

  it("includes file path as section header in output", async () => {
    mockGlob.mockResolvedValue(["services/agent/logs/server.log"]);
    mockReadFile.mockResolvedValue("startup complete\n");

    const result = await checkLogs();

    expect(result).toContain("--- services/agent/logs/server.log ---");
  });

  it("result can be used as MCP text content", async () => {
    mockGlob.mockResolvedValue([]);

    const result = await checkLogs();
    const mcpContent = [{ type: "text" as const, text: result }];

    expect(mcpContent[0].type).toBe("text");
    expect(typeof mcpContent[0].text).toBe("string");
  });
});
