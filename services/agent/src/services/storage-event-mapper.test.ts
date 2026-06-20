import { describe, it, expect } from "vitest";
import { mapForStorage } from "./storage-event-mapper.js";
import type {
  ToolUseEvent,
  ToolResultEvent,
  AssistantTextEvent,
  TurnMetricsEvent,
} from "@mbe/agent-core";

describe("mapForStorage", () => {
  describe("ToolUseEvent", () => {
    it("extracts toolName and summarizes file_path input", () => {
      const event: ToolUseEvent = {
        type: "session:tool_use",
        toolName: "Read",
        toolInput: { file_path: "/src/auth.ts" },
        toolUseId: "tu_1",
      };
      const result = mapForStorage(event);
      expect(result.type).toBe("session:tool_use");
      expect(result.data).toMatchObject({
        toolName: "Read",
        toolInput: { file_path: "/src/auth.ts" },
      });
    });

    it("truncates long command to 200 chars", () => {
      const longCommand = "x".repeat(300);
      const event: ToolUseEvent = {
        type: "session:tool_use",
        toolName: "Bash",
        toolInput: { command: longCommand },
        toolUseId: "tu_2",
      };
      const result = mapForStorage(event);
      const input = result.data.toolInput as Record<string, unknown>;
      expect((input.command as string).length).toBe(200);
    });

    it("keeps command at 200 chars when exactly at limit", () => {
      const command = "x".repeat(200);
      const event: ToolUseEvent = {
        type: "session:tool_use",
        toolName: "Bash",
        toolInput: { command },
        toolUseId: "tu_3",
      };
      const result = mapForStorage(event);
      const input = result.data.toolInput as Record<string, unknown>;
      expect((input.command as string).length).toBe(200);
    });

    it("extracts pattern and path from Grep input", () => {
      const event: ToolUseEvent = {
        type: "session:tool_use",
        toolName: "Grep",
        toolInput: { pattern: "*.ts", path: "/src" },
        toolUseId: "tu_4",
      };
      const result = mapForStorage(event);
      expect(result.data.toolInput).toMatchObject({ pattern: "*.ts", path: "/src" });
    });

    it("prefers file_path over path when both present", () => {
      const event: ToolUseEvent = {
        type: "session:tool_use",
        toolName: "Edit",
        toolInput: { file_path: "/src/a.ts", path: "/src" },
        toolUseId: "tu_5",
      };
      const result = mapForStorage(event);
      const input = result.data.toolInput as Record<string, unknown>;
      expect(input.file_path).toBe("/src/a.ts");
      expect(input.path).toBeUndefined();
    });

    it("returns empty toolInput for empty input object", () => {
      const event: ToolUseEvent = {
        type: "session:tool_use",
        toolName: "Read",
        toolInput: {},
        toolUseId: "tu_6",
      };
      const result = mapForStorage(event);
      expect(result.data.toolInput).toEqual({});
    });
  });

  describe("AssistantTextEvent", () => {
    it("produces textPreview with full text when under limit", () => {
      const event: AssistantTextEvent = {
        type: "session:assistant",
        text: "I will fix the bug",
      };
      const result = mapForStorage(event);
      expect(result.type).toBe("session:assistant");
      expect(result.data.textPreview).toBe("I will fix the bug");
    });

    it("truncates long text to 200 chars", () => {
      const event: AssistantTextEvent = {
        type: "session:assistant",
        text: "a".repeat(300),
      };
      const result = mapForStorage(event);
      expect((result.data.textPreview as string).length).toBe(200);
    });

    it("ends truncated text with ellipsis", () => {
      const event: AssistantTextEvent = {
        type: "session:assistant",
        text: "a".repeat(300),
      };
      const result = mapForStorage(event);
      expect((result.data.textPreview as string).endsWith("…")).toBe(true);
    });

    // Cardinality contract: the old SDK-message parser joined every text block within
    // one assistant message into a single textPreview. agent-core now emits one
    // AssistantTextEvent per text block, and mapForStorage is a pure per-event
    // projection — by design it does NOT coalesce across events. So a multi-text-block
    // message becomes multiple stored entries, each independently truncated. This is
    // intentional finer granularity; critically, no assistant text is dropped.
    it("projects each assistant text event independently (no cross-event coalescing)", () => {
      const first: AssistantTextEvent = { type: "session:assistant", text: "First block" };
      const second: AssistantTextEvent = { type: "session:assistant", text: "Second block" };
      expect(mapForStorage(first).data.textPreview).toBe("First block");
      expect(mapForStorage(second).data.textPreview).toBe("Second block");
    });
  });

  describe("ToolResultEvent", () => {
    it("passes through toolUseId and isError=false", () => {
      const event: ToolResultEvent = {
        type: "session:tool_result",
        toolUseId: "tu_1",
        isError: false,
      };
      const result = mapForStorage(event);
      expect(result.type).toBe("session:tool_result");
      expect(result.data).toMatchObject({ toolUseId: "tu_1", isError: false });
    });

    it("passes through isError=true", () => {
      const event: ToolResultEvent = {
        type: "session:tool_result",
        toolUseId: "tu_2",
        isError: true,
      };
      const result = mapForStorage(event);
      expect(result.data.isError).toBe(true);
    });
  });

  describe("TurnMetricsEvent", () => {
    it("passes through all metrics fields", () => {
      const event: TurnMetricsEvent = {
        type: "session:turn_metrics",
        turnIndex: 3,
        inputTokens: 1500,
        outputTokens: 400,
        thinkingTokens: 0,
        costUsd: 0.05,
        modelId: "claude-sonnet-4-6",
      };
      const result = mapForStorage(event);
      expect(result.type).toBe("session:turn_metrics");
      expect(result.data).toMatchObject({
        turnIndex: 3,
        inputTokens: 1500,
        outputTokens: 400,
        thinkingTokens: 0,
        costUsd: 0.05,
        modelId: "claude-sonnet-4-6",
      });
    });
  });

  describe("return shape", () => {
    it("always returns { type: string; data: Record<string, unknown> }", () => {
      const event: AssistantTextEvent = {
        type: "session:assistant",
        text: "hello",
      };
      const result = mapForStorage(event);
      expect(typeof result.type).toBe("string");
      expect(typeof result.data).toBe("object");
      expect(result.data).not.toBeNull();
    });
  });
});
