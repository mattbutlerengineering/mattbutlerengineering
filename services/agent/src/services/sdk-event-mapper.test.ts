import { describe, it, expect } from "vitest";
import { mapSdkEvent } from "./sdk-event-mapper.js";
import type { SessionEvent } from "@mbe/agent-core";

// Helper to build a minimal SessionEvent
function makeEvent(type: SessionEvent["type"], data: SessionEvent["data"]): SessionEvent {
  return { type, timestamp: "2026-01-01T00:00:00.000Z", data } as SessionEvent;
}

describe("mapSdkEvent", () => {
  describe("events with message field (pass-through)", () => {
    it("passes through session:start with message", () => {
      const event = makeEvent("session:start", { message: "Session execution started" });
      const result = mapSdkEvent(event);
      expect(result.type).toBe("session:start");
      expect(result.data).toEqual({ message: "Session execution started" });
    });

    it("passes through session:error with message", () => {
      const event = makeEvent("session:error", { message: "Something went wrong" });
      const result = mapSdkEvent(event);
      expect(result.type).toBe("session:error");
      expect(result.data).toEqual({ message: "Something went wrong" });
    });
  });

  describe("session:tool_use events", () => {
    it("extracts tool_name and summarizes file_path input", () => {
      const event = makeEvent("session:tool_use", {
        tool_name: "Read",
        input: { file_path: "/src/auth.ts" },
      } as unknown as SessionEvent["data"]);
      const result = mapSdkEvent(event);
      expect(result.type).toBe("session:tool_use");
      expect(result.data).toMatchObject({
        toolName: "Read",
        toolInput: { file_path: "/src/auth.ts" },
      });
    });

    it("extracts tool_name and truncates long command", () => {
      const longCommand = "x".repeat(300);
      const event = makeEvent("session:tool_use", {
        tool_name: "Bash",
        input: { command: longCommand },
      } as unknown as SessionEvent["data"]);
      const result = mapSdkEvent(event);
      expect(result.data.toolName).toBe("Bash");
      expect((result.data.toolInput as Record<string, unknown>).command).toHaveLength(200);
    });

    it("extracts tool_name and summarizes pattern input", () => {
      const event = makeEvent("session:tool_use", {
        tool_name: "Grep",
        input: { pattern: "*.ts", path: "/src" },
      } as unknown as SessionEvent["data"]);
      const result = mapSdkEvent(event);
      expect(result.data.toolInput).toMatchObject({ pattern: "*.ts", path: "/src" });
    });

    it("returns empty toolInput for non-object input", () => {
      const event = makeEvent("session:tool_use", {
        tool_name: "Read",
        input: null,
      } as unknown as SessionEvent["data"]);
      const result = mapSdkEvent(event);
      expect(result.data.toolInput).toEqual({});
    });
  });

  describe("assistant message events", () => {
    it("remaps type to session:assistant and extracts text preview", () => {
      const event = makeEvent("session:message", {
        type: "assistant",
        content: [{ type: "text", text: "I will fix the bug" }],
      } as unknown as SessionEvent["data"]);
      const result = mapSdkEvent(event);
      expect(result.type).toBe("session:assistant");
      expect(result.data.textPreview).toBe("I will fix the bug");
    });

    it("truncates long assistant text to 200 chars", () => {
      const longText = "a".repeat(300);
      const event = makeEvent("session:message", {
        type: "assistant",
        content: [{ type: "text", text: longText }],
      } as unknown as SessionEvent["data"]);
      const result = mapSdkEvent(event);
      expect((result.data.textPreview as string).length).toBe(200);
    });

    it("joins multiple text blocks with newline", () => {
      const event = makeEvent("session:message", {
        type: "assistant",
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: "World" },
        ],
      } as unknown as SessionEvent["data"]);
      const result = mapSdkEvent(event);
      expect(result.data.textPreview).toBe("Hello\nWorld");
    });

    it("ignores non-text blocks in content array", () => {
      const event = makeEvent("session:message", {
        type: "assistant",
        content: [
          { type: "text", text: "Hello" },
          { type: "tool_use", id: "123" },
          { type: "text", text: "World" },
        ],
      } as unknown as SessionEvent["data"]);
      const result = mapSdkEvent(event);
      expect(result.data.textPreview).toBe("Hello\nWorld");
    });

    it("handles string content (not array)", () => {
      const event = makeEvent("session:message", {
        type: "assistant",
        content: "plain string",
      } as unknown as SessionEvent["data"]);
      const result = mapSdkEvent(event);
      expect(result.type).toBe("session:assistant");
      expect(result.data.textPreview).toBe("plain string");
    });
  });

  describe("generic/unknown SDK events", () => {
    it("passes through event type and sets messageType from data.type", () => {
      const event = makeEvent("session:message", {
        type: "user",
      } as unknown as SessionEvent["data"]);
      const result = mapSdkEvent(event);
      expect(result.type).toBe("session:message");
      expect(result.data.messageType).toBe("user");
    });

    it("sets messageType to unknown when data.type missing", () => {
      const event = makeEvent("session:result", {} as unknown as SessionEvent["data"]);
      const result = mapSdkEvent(event);
      expect(result.data.messageType).toBe("unknown");
    });
  });

  describe("return shape", () => {
    it("always returns { type: string; data: Record<string, unknown> }", () => {
      const event = makeEvent("session:start", { message: "hi" });
      const result = mapSdkEvent(event);
      expect(typeof result.type).toBe("string");
      expect(typeof result.data).toBe("object");
    });
  });
});
