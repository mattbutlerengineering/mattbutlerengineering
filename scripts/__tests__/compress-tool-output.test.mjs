import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.resolve(__dirname, "../../.claude/hooks/compress-tool-output.js");
const GATE = 5000; // chars threshold from hook

/**
 * Run the hook with a given stdin payload and return parsed stdout.
 */
function runHook(stdinPayload) {
  const result = spawnSync("node", [HOOK], {
    input: stdinPayload,
    encoding: "utf8",
    timeout: 5000,
  });
  return result;
}

describe("compress-tool-output hook", () => {
  it("exits 0 and emits compressed additionalContext when output exceeds gate", () => {
    const bigOutput = "x".repeat(GATE + 1);
    const payload = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      tool_response: { output: bigOutput },
      session_id: "test-session",
      cwd: "/tmp",
    });

    const result = runHook(payload);

    expect(result.status).toBe(0);

    // Hook should emit JSON with hookSpecificOutput
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty("hookSpecificOutput.additionalContext");

    const ctx = parsed.hookSpecificOutput.additionalContext;
    // The compressed/truncated context should be shorter than the original big output
    expect(ctx.length).toBeLessThan(bigOutput.length);
    // Should mention compression occurred
    expect(ctx).toMatch(/compressed|truncated|chars/i);
  });

  it("exits 0 and emits nothing (no hookSpecificOutput) when output is under gate", () => {
    const smallOutput = "small output";
    const payload = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      tool_response: { output: smallOutput },
      session_id: "test-session",
      cwd: "/tmp",
    });

    const result = runHook(payload);

    expect(result.status).toBe(0);

    // Under-gate: stdout should be empty or not contain hookSpecificOutput
    if (result.stdout.trim()) {
      const parsed = JSON.parse(result.stdout);
      // If something is emitted, it must NOT have hookSpecificOutput
      expect(parsed).not.toHaveProperty("hookSpecificOutput");
    }
  });

  it("exits 0 and emits nothing when stdin is malformed JSON (fail-open)", () => {
    const result = runHook("not valid json {{{}");

    expect(result.status).toBe(0);
    // No crash, stdout is empty or safe
    expect(result.stderr).toBeFalsy();
  });

  it("exits 0 and emits nothing when stdin is empty (fail-open)", () => {
    const result = runHook("");

    expect(result.status).toBe(0);
    expect(result.stderr).toBeFalsy();
  });
});
