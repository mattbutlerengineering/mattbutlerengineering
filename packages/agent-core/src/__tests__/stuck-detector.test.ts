import { describe, it, expect, beforeEach } from "vitest";
import { createStuckDetector } from "../stuck-detector.js";
import type { StuckDetector } from "../stuck-detector.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// ── Test helpers ────────────────────────────────────────────────────

function makeAssistantToolUse(
  toolName: string,
  input: Record<string, unknown>
): SDKMessage {
  return {
    type: "assistant",
    message: {
      content: [{ type: "tool_use", id: "tu_1", name: toolName, input }],
    },
    parent_tool_use_id: null,
    uuid: crypto.randomUUID(),
    session_id: "test-session",
  } as unknown as SDKMessage;
}

function makeAssistantText(text: string): SDKMessage {
  return {
    type: "assistant",
    message: {
      content: [{ type: "text", text }],
    },
    parent_tool_use_id: null,
    uuid: crypto.randomUUID(),
    session_id: "test-session",
  } as unknown as SDKMessage;
}

function makeUserToolResult(
  result: unknown,
  isError = false
): SDKMessage {
  const content = isError
    ? [{ type: "tool_result", tool_use_id: "tu_1", is_error: true, content: String(result) }]
    : [{ type: "tool_result", tool_use_id: "tu_1", content: String(result) }];

  return {
    type: "user",
    message: { content },
    parent_tool_use_id: null,
    tool_use_result: isError ? { is_error: true, output: result } : { output: result },
    uuid: crypto.randomUUID(),
    session_id: "test-session",
  } as unknown as SDKMessage;
}

function makeCompactBoundary(): SDKMessage {
  return {
    type: "system",
    subtype: "compact_boundary",
    compact_metadata: { trigger: "auto", pre_tokens: 150000 },
    uuid: crypto.randomUUID(),
    session_id: "test-session",
  } as unknown as SDKMessage;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("StuckDetector", () => {
  let detector: StuckDetector;

  beforeEach(() => {
    detector = createStuckDetector();
  });

  describe("no false positives", () => {
    it("returns null for diverse messages", () => {
      const messages: SDKMessage[] = [
        makeAssistantToolUse("Read", { file_path: "/a.ts" }),
        makeUserToolResult("file contents a"),
        makeAssistantToolUse("Edit", { file_path: "/b.ts", old_string: "x", new_string: "y" }),
        makeUserToolResult("edit applied"),
        makeAssistantToolUse("Bash", { command: "pnpm test" }),
        makeUserToolResult("tests passed"),
      ];

      for (const msg of messages) {
        const result = detector.ingest(msg);
        expect(result).toBeNull();
      }
    });

    it("returns null when actions repeat fewer times than threshold", () => {
      // Default threshold is 4, so 3 repeats should be fine
      for (let i = 0; i < 3; i++) {
        detector.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
        detector.ingest(makeUserToolResult("same content"));
      }
      // No detection at 3 repeats
    });
  });

  describe("repeated_action_observation", () => {
    it("detects same action + same observation repeated 4 times", () => {
      let result = null;
      for (let i = 0; i < 4; i++) {
        detector.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
        result = detector.ingest(makeUserToolResult("same content"));
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("repeated_action_observation");
      expect(result!.count).toBe(4);
    });

    it("does not trigger when observations differ", () => {
      let result = null;
      for (let i = 0; i < 4; i++) {
        detector.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
        result = detector.ingest(makeUserToolResult(`content ${i}`));
      }

      expect(result).toBeNull();
    });
  });

  describe("repeated_error", () => {
    it("detects same action producing errors 3 times", () => {
      let result = null;
      for (let i = 0; i < 3; i++) {
        detector.ingest(
          makeAssistantToolUse("Bash", { command: "npm run build" })
        );
        result = detector.ingest(
          makeUserToolResult("Error: Build failed", true)
        );
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("repeated_error");
      expect(result!.count).toBe(3);
    });

    it("resets error count on non-error observation", () => {
      // Two errors
      for (let i = 0; i < 2; i++) {
        detector.ingest(
          makeAssistantToolUse("Bash", { command: "npm run build" })
        );
        detector.ingest(makeUserToolResult("Error: Build failed", true));
      }

      // One success breaks the streak
      detector.ingest(
        makeAssistantToolUse("Read", { file_path: "/package.json" })
      );
      detector.ingest(makeUserToolResult("{ \"name\": \"test\" }"));

      // Two more errors — should not trigger (streak reset)
      let result = null;
      for (let i = 0; i < 2; i++) {
        detector.ingest(
          makeAssistantToolUse("Bash", { command: "npm run build" })
        );
        result = detector.ingest(makeUserToolResult("Error: Build failed", true));
      }

      expect(result).toBeNull();
    });
  });

  describe("self_message_loop", () => {
    it("detects agent sending same text message 3 times", () => {
      let result = null;
      for (let i = 0; i < 3; i++) {
        result = detector.ingest(
          makeAssistantText("I'll help you fix that bug.")
        );
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("self_message_loop");
      expect(result!.count).toBe(3);
    });

    it("does not trigger for different text messages", () => {
      detector.ingest(makeAssistantText("Message one"));
      detector.ingest(makeAssistantText("Message two"));
      const result = detector.ingest(makeAssistantText("Message three"));

      expect(result).toBeNull();
    });
  });

  describe("alternating_pairs", () => {
    it("detects A,B,A,B,A,B pattern", () => {
      let result = null;
      for (let i = 0; i < 3; i++) {
        detector.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
        detector.ingest(makeUserToolResult("content a"));
        detector.ingest(makeAssistantToolUse("Write", { file_path: "/a.ts", content: "new" }));
        result = detector.ingest(makeUserToolResult("written"));
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("alternating_pairs");
      expect(result!.count).toBe(3);
    });

    it("does not trigger for non-alternating patterns", () => {
      const tools = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"];
      let result = null;
      for (const tool of tools) {
        detector.ingest(makeAssistantToolUse(tool, { file_path: "/a.ts" }));
        result = detector.ingest(makeUserToolResult("ok"));
      }

      expect(result).toBeNull();
    });
  });

  describe("context_window_loop", () => {
    it("detects excessive compact boundary messages", () => {
      let result = null;
      for (let i = 0; i < 10; i++) {
        result = detector.ingest(makeCompactBoundary());
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("context_window_loop");
      expect(result!.count).toBe(10);
    });

    it("does not trigger below threshold", () => {
      let result = null;
      for (let i = 0; i < 9; i++) {
        result = detector.ingest(makeCompactBoundary());
      }

      expect(result).toBeNull();
    });
  });

  describe("zero_progress", () => {
    it("detects no tool use over N consecutive text turns", () => {
      let result = null;
      for (let i = 0; i < 10; i++) {
        result = detector.ingest(
          makeAssistantText(`Thinking about step ${i}...`)
        );
      }

      // The self-message loop check fires first if messages are identical,
      // but these are all different, so zero_progress should fire
      expect(result).not.toBeNull();
      expect(result!.type).toBe("zero_progress");
      expect(result!.count).toBe(10);
    });

    it("resets counter when tool is used", () => {
      // 5 text turns
      for (let i = 0; i < 5; i++) {
        detector.ingest(makeAssistantText(`Step ${i}`));
      }

      // Tool use resets the counter
      detector.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
      detector.ingest(makeUserToolResult("content"));

      // 5 more text turns — total is 5, not 10
      let result = null;
      for (let i = 0; i < 5; i++) {
        result = detector.ingest(makeAssistantText(`Step ${i + 5}`));
      }

      expect(result).toBeNull();
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      // Build up some state
      for (let i = 0; i < 3; i++) {
        detector.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
        detector.ingest(makeUserToolResult("same content"));
      }

      detector.reset();

      // One more repeat should NOT trigger (state was cleared)
      detector.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
      const result = detector.ingest(makeUserToolResult("same content"));

      expect(result).toBeNull();
    });
  });

  describe("custom thresholds", () => {
    it("respects custom repeatedActionThreshold", () => {
      const strictDetector = createStuckDetector({
        repeatedActionThreshold: 2,
      });

      strictDetector.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
      strictDetector.ingest(makeUserToolResult("same"));
      strictDetector.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
      const result = strictDetector.ingest(makeUserToolResult("same"));

      expect(result).not.toBeNull();
      expect(result!.type).toBe("repeated_action_observation");
      expect(result!.threshold).toBe(2);
    });
  });

  describe("PID normalization", () => {
    it("treats observations with different PIDs as equal", () => {
      let result = null;
      for (let i = 0; i < 4; i++) {
        detector.ingest(makeAssistantToolUse("Bash", { command: "ps aux" }));
        result = detector.ingest(
          makeUserToolResult(`node pid=${1000 + i} running server on 0x${(3000 + i).toString(16)}`)
        );
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("repeated_action_observation");
    });
  });
});
