/**
 * Seam test for the rialto-plugin PostToolUse hook (#6391).
 *
 * Executes the real command from packages/rialto-plugin/hooks/hooks.json with a
 * stdin payload, the way Claude Code does. The hook used to read a nonexistent
 * $CLAUDE_TOOL_ARG_FILE_PATH env var, so it exited early on every call and never
 * checked a file.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PLUGIN_ROOT = resolve(import.meta.dirname, "../../packages/rialto-plugin");
const HOOKS = JSON.parse(readFileSync(join(PLUGIN_ROOT, "hooks/hooks.json"), "utf-8"));
const COMMAND = HOOKS.PostToolUse[0].hooks[0].command;

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rialto-plugin-hook-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function runHook(stdin) {
  return spawnSync("sh", ["-c", COMMAND], {
    input: stdin,
    encoding: "utf-8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
  });
}

function payloadFor(file) {
  return JSON.stringify({ tool_name: "Write", tool_input: { file_path: file } });
}

function write(name, content) {
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
}

describe("rialto-plugin validate hook", () => {
  it("does not depend on a nonexistent CLAUDE_TOOL_ARG_* env var", () => {
    expect(COMMAND).not.toContain("CLAUDE_TOOL_ARG");
  });

  it("warns about a hardcoded hex color from the stdin payload", () => {
    const file = write("a.css", ".a { color:#ff0000; } /* rialto */\n");
    const r = runHook(payloadFor(file));
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("Hardcoded color");
  });

  it("does not flag @mattbutlerengineering/rialto subpath imports", () => {
    const file = write("b.tsx", 'import { Button } from "@mattbutlerengineering/rialto/Button";\n');
    const r = runHook(payloadFor(file));
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("fails open on malformed or empty stdin", () => {
    for (const input of ["", "not json", "{}", JSON.stringify({ tool_input: {} })]) {
      const r = runHook(input);
      expect(r.status).toBe(0);
      expect(r.stderr).toBe("");
    }
  });
});
