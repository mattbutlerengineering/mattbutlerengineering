import { describe, it, expect } from "vitest";
import { resolveSessionAdapter } from "../adapter-resolution.js";
import { ClaudeAdapter } from "../adapters/claude-adapter.js";
import { GeminiCliAdapter } from "../adapters/gemini-adapter.js";
import { OpenCodeAdapter } from "../adapters/opencode-adapter.js";
import { FailoverSessionAdapter } from "../adapters/failover-session-adapter.js";

describe("resolveSessionAdapter", () => {
  it("resolves 'claude' to a ClaudeAdapter", () => {
    expect(resolveSessionAdapter("claude")).toBeInstanceOf(ClaudeAdapter);
  });

  it("resolves 'gemini' to a GeminiCliAdapter", () => {
    expect(resolveSessionAdapter("gemini")).toBeInstanceOf(GeminiCliAdapter);
  });

  it("resolves 'opencode' to an OpenCodeAdapter", () => {
    expect(resolveSessionAdapter("opencode")).toBeInstanceOf(OpenCodeAdapter);
  });

  it("resolves 'auto' to a FailoverSessionAdapter cascading claude -> gemini -> opencode", () => {
    const adapter = resolveSessionAdapter("auto");
    expect(adapter).toBeInstanceOf(FailoverSessionAdapter);
  });

  it("'auto' cascade tries claude first, then gemini, then opencode", async () => {
    const adapter = resolveSessionAdapter("auto") as FailoverSessionAdapter;
    // Force every adapter to report unavailable so we can observe cascade
    // order via isAvailable() call sequence without invoking real CLIs.
    const order: string[] = [];
    const adapters = (
      adapter as unknown as {
        adapters: readonly { name: string; isAvailable: () => Promise<boolean> }[];
      }
    ).adapters;
    for (const a of adapters) {
      const original = a.isAvailable.bind(a);
      a.isAvailable = async () => {
        order.push(a.name);
        return original();
      };
    }

    await expect(
      adapter.runSession({
        taskDescription: "task",
        repoPath: "/repo",
        baseBranch: "main",
        model: "m",
        maxTurns: 1,
        maxBudgetUsd: 1,
        allowedTools: [],
        createPr: false,
      })
    ).rejects.toThrow();

    expect(order).toEqual(["claude", "gemini", "opencode"]);
  });
});
