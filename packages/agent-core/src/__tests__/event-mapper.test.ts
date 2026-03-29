import { describe, it, expect } from "vitest";
import { mapSdkMessage } from "../event-mapper.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

function makeAssistantWithToolUse(
  toolName: string,
  input: Record<string, unknown>,
  id = "tu_1"
): SDKMessage {
  return {
    type: "assistant",
    message: {
      content: [{ type: "tool_use", id, name: toolName, input }],
    },
    parent_tool_use_id: null,
    uuid: crypto.randomUUID(),
    session_id: "test",
  } as unknown as SDKMessage;
}

function makeAssistantWithText(text: string): SDKMessage {
  return {
    type: "assistant",
    message: {
      content: [{ type: "text", text }],
    },
    parent_tool_use_id: null,
    uuid: crypto.randomUUID(),
    session_id: "test",
  } as unknown as SDKMessage;
}

function makeAssistantMixed(
  text: string,
  toolName: string,
  input: Record<string, unknown>
): SDKMessage {
  return {
    type: "assistant",
    message: {
      content: [
        { type: "text", text },
        { type: "tool_use", id: "tu_1", name: toolName, input },
      ],
    },
    parent_tool_use_id: null,
    uuid: crypto.randomUUID(),
    session_id: "test",
  } as unknown as SDKMessage;
}

function makeUserToolResult(
  toolUseId: string,
  isError = false
): SDKMessage {
  return {
    type: "user",
    message: {
      content: [
        { type: "tool_result", tool_use_id: toolUseId, is_error: isError, content: "result" },
      ],
    },
    parent_tool_use_id: null,
    uuid: crypto.randomUUID(),
    session_id: "test",
  } as unknown as SDKMessage;
}

describe("mapSdkMessage", () => {
  describe("assistant messages", () => {
    it("maps tool_use blocks to ToolUseEvent", () => {
      const msg = makeAssistantWithToolUse("Read", { file_path: "/a.ts" }, "tu_abc");
      const events = mapSdkMessage(msg);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "session:tool_use",
        toolName: "Read",
        toolInput: { file_path: "/a.ts" },
        toolUseId: "tu_abc",
      });
    });

    it("maps text blocks to AssistantTextEvent", () => {
      const msg = makeAssistantWithText("I'll fix the bug");
      const events = mapSdkMessage(msg);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "session:assistant",
        text: "I'll fix the bug",
      });
    });

    it("skips empty text blocks", () => {
      const msg = makeAssistantWithText("   ");
      const events = mapSdkMessage(msg);

      expect(events).toHaveLength(0);
    });

    it("maps mixed content to multiple events", () => {
      const msg = makeAssistantMixed("Let me read the file", "Read", { file_path: "/a.ts" });
      const events = mapSdkMessage(msg);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("session:assistant");
      expect(events[1].type).toBe("session:tool_use");
    });
  });

  describe("user messages (tool results)", () => {
    it("maps tool_result to ToolResultEvent", () => {
      const msg = makeUserToolResult("tu_abc");
      const events = mapSdkMessage(msg);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "session:tool_result",
        toolUseId: "tu_abc",
        isError: false,
      });
    });

    it("maps error tool_result correctly", () => {
      const msg = makeUserToolResult("tu_abc", true);
      const events = mapSdkMessage(msg);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "session:tool_result",
        toolUseId: "tu_abc",
        isError: true,
      });
    });
  });

  describe("other message types", () => {
    it("returns empty array for system messages", () => {
      const msg = {
        type: "system",
        subtype: "init",
        uuid: crypto.randomUUID(),
        session_id: "test",
      } as unknown as SDKMessage;

      const events = mapSdkMessage(msg);
      expect(events).toHaveLength(0);
    });

    it("returns empty array for result messages", () => {
      const msg = {
        type: "result",
        subtype: "success",
        uuid: crypto.randomUUID(),
        session_id: "test",
      } as unknown as SDKMessage;

      const events = mapSdkMessage(msg);
      expect(events).toHaveLength(0);
    });
  });
});
