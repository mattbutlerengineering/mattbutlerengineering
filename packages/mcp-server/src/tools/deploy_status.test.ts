import { describe, it, expect, vi, beforeEach } from "vitest";
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { deployStatus } from "./deploy_status.js";

describe("deployStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses doctl output into structured app list", async () => {
    vi.mocked(execSync).mockReturnValue(
      "abc123  my-app  ACTIVE  none\ndef456  other-app  DEPLOYING  DEPLOYING\n"
    );

    const result = await deployStatus();
    const parsed = JSON.parse(result) as {
      apps: Array<{ id: string; name: string; activePhase: string; inProgressPhase: string }>;
    };

    expect(Array.isArray(parsed.apps)).toBe(true);
    expect(parsed.apps).toHaveLength(2);
    expect(parsed.apps[0].id).toBe("abc123");
    expect(parsed.apps[0].name).toBe("my-app");
    expect(parsed.apps[0].activePhase).toBe("ACTIVE");
  });

  it("returns empty apps array when doctl output is empty", async () => {
    vi.mocked(execSync).mockReturnValue("");

    const result = await deployStatus();
    const parsed = JSON.parse(result) as { apps: unknown[] };

    expect(parsed.apps).toEqual([]);
  });

  it("sets inProgressPhase to 'none' when column is absent", async () => {
    vi.mocked(execSync).mockReturnValue("abc123  my-app  ACTIVE\n");

    const result = await deployStatus();
    const parsed = JSON.parse(result) as {
      apps: Array<{ inProgressPhase: string }>;
    };

    expect(parsed.apps[0].inProgressPhase).toBe("none");
  });

  it("returns error JSON when doctl command fails", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("doctl: not authenticated");
    });

    const result = await deployStatus();
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get deploy status");
    expect(parsed.message).toBe("doctl: not authenticated");
  });

  it("returns error JSON when non-Error is thrown", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw "auth expired";
    });

    const result = await deployStatus();
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get deploy status");
    expect(parsed.message).toBe("auth expired");
  });

  it("result is a valid MCP text content string", async () => {
    vi.mocked(execSync).mockReturnValue("");

    const result = await deployStatus();
    const mcpContent = [{ type: "text" as const, text: result }];

    expect(mcpContent[0].type).toBe("text");
    expect(typeof mcpContent[0].text).toBe("string");
  });
});
