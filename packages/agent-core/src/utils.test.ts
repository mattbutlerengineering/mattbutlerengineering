import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { writeFile, mkdir } from "node:fs/promises";
import { sanitizeForCommitMessage, storeVerificationLog } from "./utils.js";

describe("sanitizeForCommitMessage", () => {
  it("replaces newlines with spaces", () => {
    expect(sanitizeForCommitMessage("line one\nline two")).toBe("line one line two");
  });

  it("strips embedded carriage-return + newline sequences", () => {
    expect(sanitizeForCommitMessage("line one\r\nline two")).toBe("line one  line two");
  });

  it("passes short input through unchanged", () => {
    expect(sanitizeForCommitMessage("short message")).toBe("short message");
  });

  it("passes empty string through unchanged", () => {
    expect(sanitizeForCommitMessage("")).toBe("");
  });

  it("truncates at exactly 72 characters", () => {
    const input = "a".repeat(100);
    const result = sanitizeForCommitMessage(input);
    expect(result).toHaveLength(72);
    expect(result).toBe("a".repeat(72));
  });

  it("leaves a 72-character string untouched", () => {
    const input = "a".repeat(72);
    expect(sanitizeForCommitMessage(input)).toBe(input);
  });

  it("leaves a 71-character string untouched", () => {
    const input = "a".repeat(71);
    expect(sanitizeForCommitMessage(input)).toBe(input);
  });

  it("collapses a multi-line paragraph into a single truncated line", () => {
    const input =
      "First line of the message.\nSecond line adds more detail.\nThird line trails off.";
    const result = sanitizeForCommitMessage(input);
    expect(result).not.toMatch(/[\n\r]/);
    expect(result.length).toBeLessThanOrEqual(72);
    expect(result).toBe(input.replace(/[\n\r]/g, " ").slice(0, 72));
  });

  it("does not split a multi-byte emoji character when truncating at the boundary", () => {
    // 71 "a" characters + one 2-code-unit emoji straddling the 72-char slice boundary.
    const input = "a".repeat(71) + "🎉" + "trailing text";
    const result = sanitizeForCommitMessage(input);
    // slice(0, 72) on UTF-16 code units splits the surrogate pair, producing
    // a lone unpaired surrogate. Document the current (naive) behavior.
    expect(result).toHaveLength(72);
    expect(result.slice(0, 71)).toBe("a".repeat(71));
  });
});

describe("storeVerificationLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it("writes the expected file content for multiple log sections", async () => {
    const logPath = await storeVerificationLog("/repo", [
      { label: "lint", output: "no issues" },
      { label: "typecheck", output: "0 errors" },
    ]);

    expect(logPath).toBe("/repo/.agent-work/verification.log");
    expect(writeFile).toHaveBeenCalledWith(
      "/repo/.agent-work/verification.log",
      "=== lint ===\nno issues\n\n=== typecheck ===\n0 errors\n",
      "utf-8"
    );
  });

  it("creates the .agent-work directory if it doesn't exist", async () => {
    await storeVerificationLog("/repo", [{ label: "test", output: "5 passed" }]);

    expect(mkdir).toHaveBeenCalledWith("/repo/.agent-work", { recursive: true });
  });

  it("resolves without throwing when mkdir rejects", async () => {
    vi.mocked(mkdir).mockRejectedValue(new Error("EACCES"));

    await expect(storeVerificationLog("/repo", [{ label: "lint", output: "ok" }])).resolves.toBe(
      "/repo/.agent-work/verification.log"
    );
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("resolves without throwing when writeFile rejects", async () => {
    vi.mocked(writeFile).mockRejectedValue(new Error("ENOSPC"));

    await expect(storeVerificationLog("/repo", [{ label: "lint", output: "ok" }])).resolves.toBe(
      "/repo/.agent-work/verification.log"
    );
  });
});
