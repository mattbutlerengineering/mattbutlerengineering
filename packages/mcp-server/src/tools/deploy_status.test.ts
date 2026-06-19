import { describe, it, expect, vi } from "vitest";
import { deployStatus } from "./deploy_status.js";

describe("deployStatus", () => {
  it("parses doctl output into structured app list", async () => {
    const run = vi
      .fn()
      .mockReturnValue("abc123  my-app  ACTIVE  none\ndef456  other-app  DEPLOYING  DEPLOYING");

    const result = await deployStatus(run);
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
    const run = vi.fn().mockReturnValue("");

    const result = await deployStatus(run);
    const parsed = JSON.parse(result) as { apps: unknown[] };

    expect(parsed.apps).toEqual([]);
  });

  it("sets inProgressPhase to 'none' when column is absent", async () => {
    const run = vi.fn().mockReturnValue("abc123  my-app  ACTIVE");

    const result = await deployStatus(run);
    const parsed = JSON.parse(result) as {
      apps: Array<{ inProgressPhase: string }>;
    };

    expect(parsed.apps[0].inProgressPhase).toBe("none");
  });

  it("returns error JSON when runner returns error envelope", async () => {
    const envelope = JSON.stringify({
      error: "Failed to get deploy status",
      message: "doctl: not authenticated",
    });
    const run = vi.fn().mockReturnValue(envelope);

    const result = await deployStatus(run);
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get deploy status");
    expect(parsed.message).toBe("doctl: not authenticated");
  });

  it("returns error JSON when non-Error envelope is returned", async () => {
    const envelope = JSON.stringify({
      error: "Failed to get deploy status",
      message: "auth expired",
    });
    const run = vi.fn().mockReturnValue(envelope);

    const result = await deployStatus(run);
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get deploy status");
    expect(parsed.message).toBe("auth expired");
  });

  it("result is a valid MCP text content string", async () => {
    const run = vi.fn().mockReturnValue("");

    const result = await deployStatus(run);
    const mcpContent = [{ type: "text" as const, text: result }];

    expect(mcpContent[0].type).toBe("text");
    expect(typeof mcpContent[0].text).toBe("string");
  });
});
