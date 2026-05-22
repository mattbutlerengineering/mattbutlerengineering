import { test, expect, describe, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Mocking fs and child_process is tedious for this script since it's a CLI.
// I'll do a simple integration test with a temporary file.

describe("Chaos Agent", () => {
  const tempFile = path.resolve("./temp-chaos-target.tsx");

  beforeEach(() => {
    fs.writeFileSync(
      tempFile,
      `
export default function MyComponent() {
  return (
    <div aria-label="test-label">
      <h1>Hello</h1>
    </div>
  );
}
    `
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  });

  test("injects console-error", async () => {
    // We'll run the script logic directly or via exec
    // For simplicity, I'll just verify the injectBug function logic if I could export it,
    // but the script is a monolith. I'll use execFileSync.

    execFileSync(
      "node",
      ["scripts/chaos-agent.mjs", "--type", "console-error", "--file", tempFile],
      {
        env: { ...process.env, TARGET_FILE: tempFile },
      }
    );

    // Note: I need to modify chaos-agent.mjs to accept --file for testing
    const content = fs.readFileSync(tempFile, "utf-8");
    expect(content).toContain("CHAOS-ERROR");
    expect(content).toContain("import React");
  });

  test("injects accessibility bug", async () => {
    execFileSync("node", [
      "scripts/chaos-agent.mjs",
      "--type",
      "accessibility",
      "--file",
      tempFile,
    ]);
    const content = fs.readFileSync(tempFile, "utf-8");
    expect(content).not.toContain('aria-label="test-label"');
  });
});
