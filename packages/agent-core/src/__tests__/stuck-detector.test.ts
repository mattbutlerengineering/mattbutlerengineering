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
      expect(result!.severity).toBe("error");
    });

    it("does not trigger when observations differ", () => {
      let result = null;
      for (let i = 0; i < 4; i++) {
        detector.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
        result = detector.ingest(makeUserToolResult(`content ${i}`));
      }

      expect(result).toBeNull();
    });

    it("does not trigger when context changed between retries", () => {
      // Simulate: agent tries command, fails, edits file, retries same command
      // The observation fingerprints change between the repeated actions
      const d = createStuckDetector({ repeatedActionThreshold: 3 });

      // Attempt 1
      d.ingest(makeAssistantToolUse("Bash", { command: "pnpm build" }));
      d.ingest(makeUserToolResult("build failed: missing dep"));

      // Agent fixes the issue (different observation fingerprint injected)
      d.ingest(makeAssistantToolUse("Edit", { file_path: "/package.json", old_string: "a", new_string: "b" }));
      d.ingest(makeUserToolResult("edit applied"));

      // Attempt 2 — same command but context changed
      d.ingest(makeAssistantToolUse("Bash", { command: "pnpm build" }));
      d.ingest(makeUserToolResult("build failed: missing dep"));

      // Agent fixes again
      d.ingest(makeAssistantToolUse("Edit", { file_path: "/tsconfig.json", old_string: "x", new_string: "y" }));
      d.ingest(makeUserToolResult("edit applied"));

      // Attempt 3
      d.ingest(makeAssistantToolUse("Bash", { command: "pnpm build" }));
      const result = d.ingest(makeUserToolResult("build failed: missing dep"));

      // Should not trigger because other actions happened between repeats
      // The action fingerprints aren't consecutive identical ones
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
      expect(result!.severity).toBe("error");
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
      expect(result!.severity).toBe("error");
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
      expect(result!.severity).toBe("error");
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
    it("emits warning at threshold 2 compactions", () => {
      let result = null;
      for (let i = 0; i < 2; i++) {
        result = detector.ingest(makeCompactBoundary());
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("context_window_warning");
      expect(result!.severity).toBe("warning");
      expect(result!.count).toBe(2);
    });

    it("detects error at 5 compact boundary messages (lowered threshold)", () => {
      let result = null;
      for (let i = 0; i < 5; i++) {
        result = detector.ingest(makeCompactBoundary());
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("context_window_loop");
      expect(result!.severity).toBe("error");
      expect(result!.count).toBe(5);
    });

    it("does not trigger error below threshold", () => {
      let result = null;
      for (let i = 0; i < 4; i++) {
        result = detector.ingest(makeCompactBoundary());
      }

      // Should be a warning, not an error
      expect(result).not.toBeNull();
      expect(result!.type).toBe("context_window_warning");
      expect(result!.severity).toBe("warning");
    });
  });

  describe("zero_progress", () => {
    it("detects no tool use over 5 consecutive text turns (lowered threshold)", () => {
      let result = null;
      for (let i = 0; i < 5; i++) {
        result = detector.ingest(
          makeAssistantText(`Thinking about step ${i}...`)
        );
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("zero_progress");
      expect(result!.count).toBe(5);
      expect(result!.severity).toBe("error");
    });

    it("resets counter when tool is used", () => {
      // 3 text turns
      for (let i = 0; i < 3; i++) {
        detector.ingest(makeAssistantText(`Step ${i}`));
      }

      // Tool use resets the counter
      detector.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
      detector.ingest(makeUserToolResult("content"));

      // 3 more text turns — total is 3, not 6
      let result = null;
      for (let i = 0; i < 3; i++) {
        result = detector.ingest(makeAssistantText(`Step ${i + 3}`));
      }

      expect(result).toBeNull();
    });

    it("does not trigger when output is substantial (genuine reasoning)", () => {
      const longText = "A".repeat(600); // > 500 chars threshold
      let result = null;
      for (let i = 0; i < 6; i++) {
        result = detector.ingest(
          makeAssistantText(`${longText} step ${i}`)
        );
      }

      // Should not trigger because output exceeds zeroProgressMinOutputChars
      expect(result).toBeNull();
    });

    it("triggers when output is short even after threshold", () => {
      let result = null;
      for (let i = 0; i < 5; i++) {
        result = detector.ingest(
          makeAssistantText(`Thinking step ${i}...`)
        );
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("zero_progress");
    });
  });

  describe("silent_failure_loop", () => {
    it("detects tool success with no file modifications over window", () => {
      // First, establish that agent has used file-modifying tools
      detector.ingest(makeAssistantToolUse("Edit", { file_path: "/a.ts", old_string: "x", new_string: "y" }));
      detector.ingest(makeUserToolResult("edit applied"));

      // Now: 3 consecutive Read calls that succeed but don't modify files
      let result = null;
      for (let i = 0; i < 3; i++) {
        detector.ingest(makeAssistantToolUse("Read", { file_path: `/file${i}.ts` }));
        result = detector.ingest(makeUserToolResult("file content"));
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("silent_failure_loop");
      expect(result!.severity).toBe("warning");
    });

    it("does not trigger when file-modifying tools are used", () => {
      detector.ingest(makeAssistantToolUse("Edit", { file_path: "/a.ts", old_string: "x", new_string: "y" }));
      detector.ingest(makeUserToolResult("edit applied"));

      // Mix of Read and Edit — Edit resets the counter
      detector.ingest(makeAssistantToolUse("Read", { file_path: "/b.ts" }));
      detector.ingest(makeUserToolResult("content"));
      detector.ingest(makeAssistantToolUse("Edit", { file_path: "/b.ts", old_string: "a", new_string: "b" }));
      detector.ingest(makeUserToolResult("edit applied"));
      detector.ingest(makeAssistantToolUse("Read", { file_path: "/c.ts" }));
      const result = detector.ingest(makeUserToolResult("content"));

      expect(result).toBeNull();
    });

    it("does not trigger when no file-modifying tools were ever used", () => {
      // Agent only reads files — no expectation of file modifications
      let result = null;
      for (let i = 0; i < 5; i++) {
        detector.ingest(makeAssistantToolUse("Read", { file_path: `/file${i}.ts` }));
        result = detector.ingest(makeUserToolResult("content"));
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

    it("respects custom contextWindowLoopThreshold", () => {
      const customDetector = createStuckDetector({
        contextWindowLoopThreshold: 3,
        contextWindowWarningThreshold: 1,
      });

      // 1 compact → warning
      let result = customDetector.ingest(makeCompactBoundary());
      expect(result).not.toBeNull();
      expect(result!.type).toBe("context_window_warning");

      // 3 compacts → error
      customDetector.ingest(makeCompactBoundary());
      result = customDetector.ingest(makeCompactBoundary());
      expect(result).not.toBeNull();
      expect(result!.type).toBe("context_window_loop");
    });

    it("respects custom zeroProgressThreshold", () => {
      const customDetector = createStuckDetector({
        zeroProgressThreshold: 3,
      });

      let result = null;
      for (let i = 0; i < 3; i++) {
        result = customDetector.ingest(
          makeAssistantText(`Step ${i}`)
        );
      }

      expect(result).not.toBeNull();
      expect(result!.type).toBe("zero_progress");
      expect(result!.threshold).toBe(3);
    });

    it("respects custom zeroProgressMinOutputChars", () => {
      const customDetector = createStuckDetector({
        zeroProgressThreshold: 3,
        zeroProgressMinOutputChars: 100,
      });

      // Text longer than 100 chars should not trigger
      const longText = "A".repeat(150);
      let result = null;
      for (let i = 0; i < 4; i++) {
        result = customDetector.ingest(makeAssistantText(longText));
      }

      // Should trigger self_message_loop instead (same text), not zero_progress
      // because the text exceeds the char threshold
      expect(result).not.toBeNull();
      expect(result!.type).toBe("self_message_loop");
    });

    it("respects custom silentFailureTurnWindow", () => {
      const customDetector = createStuckDetector({
        silentFailureTurnWindow: 2,
      });

      // Establish file-modifying context
      customDetector.ingest(makeAssistantToolUse("Write", { file_path: "/a.ts", content: "x" }));
      customDetector.ingest(makeUserToolResult("written"));

      // 2 non-modifying turns
      customDetector.ingest(makeAssistantToolUse("Read", { file_path: "/b.ts" }));
      customDetector.ingest(makeUserToolResult("content"));
      customDetector.ingest(makeAssistantToolUse("Glob", { pattern: "*.ts" }));
      const result = customDetector.ingest(makeUserToolResult("file list"));

      expect(result).not.toBeNull();
      expect(result!.type).toBe("silent_failure_loop");
    });
  });

  describe("severity levels", () => {
    it("returns error severity for stuck patterns", () => {
      // repeated_action_observation
      const d = createStuckDetector({ repeatedActionThreshold: 2 });
      d.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
      d.ingest(makeUserToolResult("same"));
      d.ingest(makeAssistantToolUse("Read", { file_path: "/a.ts" }));
      const result = d.ingest(makeUserToolResult("same"));

      expect(result!.severity).toBe("error");
    });

    it("returns warning severity for context_window_warning", () => {
      const d = createStuckDetector();
      d.ingest(makeCompactBoundary());
      const result = d.ingest(makeCompactBoundary());

      expect(result!.severity).toBe("warning");
    });

    it("returns warning severity for silent_failure_loop", () => {
      const d = createStuckDetector({ silentFailureTurnWindow: 2 });
      d.ingest(makeAssistantToolUse("Edit", { file_path: "/a.ts", old_string: "x", new_string: "y" }));
      d.ingest(makeUserToolResult("applied"));
      d.ingest(makeAssistantToolUse("Read", { file_path: "/b.ts" }));
      d.ingest(makeUserToolResult("content"));
      d.ingest(makeAssistantToolUse("Grep", { pattern: "foo" }));
      const result = d.ingest(makeUserToolResult("matches"));

      expect(result!.severity).toBe("warning");
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
