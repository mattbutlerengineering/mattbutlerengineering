/**
 * Contract tests for how `.claude/settings.json` hooks receive their input.
 *
 * Two layers:
 *   1. Unit — the scripts/hook-input.mjs adapter against the measured payload shape.
 *   2. Seam — every Edit/Write hook command in the real `.claude/settings.json`
 *      is executed for real, inside a throwaway sandbox, with a stub `npx` on
 *      PATH. That catches the #3631 regression class directly: an empty path
 *      must make each hook a no-op, never an unbounded `prettier --write ""`
 *      across the whole working directory.
 *
 * The sandbox is the safety net — `cwd` is a temp dir, so even a hook that did
 * fan out to "format everything" would hit the fixtures here and fail the
 * assertions rather than dirty the repo.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractHookField, extractHookFilePath, parseHookPayload } from "../hook-input.mjs";

/** Generous ceiling: these tests spawn real subprocesses under a loaded CI box. */
const SEAM_TIMEOUT_MS = 60_000;

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const SETTINGS_PATH = join(REPO_ROOT, ".claude", "settings.json");

const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));

/** Every `command` hook whose matcher applies to a Write tool call. */
function writeHookCommands() {
  const events = [...(settings.hooks?.PreToolUse ?? []), ...(settings.hooks?.PostToolUse ?? [])];
  return events
    .filter((entry) => new RegExp(entry.matcher ?? "").test("Write"))
    .flatMap((entry) => entry.hooks ?? [])
    .filter((hook) => hook.type === "command")
    .map((hook) => hook.command);
}

const commandContaining = (needle) => writeHookCommands().find((cmd) => cmd.includes(needle));

const payloadFor = (filePath) =>
  JSON.stringify({
    session_id: "test-session",
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    tool_input: filePath === undefined ? { content: "x" } : { file_path: filePath, content: "x" },
    tool_use_id: "toolu_test",
  });

const UGLY_JS = "const   a={b:1,   c:2}\n";
const UGLY_RC = '{"semi":   true}\n';

describe("extractHookFilePath", () => {
  it("reads the path from the measured stdin payload shape", () => {
    expect(extractHookFilePath(payloadFor("/repo/src/a.ts"))).toBe("/repo/src/a.ts");
  });

  it.each([
    ["empty stdin", ""],
    ["whitespace only", "   \n"],
    ["malformed JSON", "{not json"],
    ["payload with no tool_input", '{"tool_name":"Write"}'],
    ["tool_input with no file_path", '{"tool_input":{"content":"x"}}'],
    ["non-string file_path", '{"tool_input":{"file_path":42}}'],
  ])("returns an empty string for %s", (_label, payload) => {
    expect(extractHookFilePath(payload)).toBe("");
  });
});

describe("extractHookField", () => {
  it("reads tool_name from the top of the envelope", () => {
    expect(extractHookField(payloadFor("/a.ts"), "tool_name")).toBe("Write");
  });

  // The Bash-tool hooks still broken under the fictional $CLAUDE_BASH_COMMAND
  // must be able to adopt this adapter without changing it.
  it("reads a Bash command out of tool_input", () => {
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git push --force" },
    });
    expect(extractHookField(payload, "command")).toBe("git push --force");
  });

  it("returns an empty string for an unknown field", () => {
    expect(extractHookField(payloadFor("/a.ts"), "nope")).toBe("");
  });
});

describe("parseHookPayload", () => {
  it("returns the parsed envelope", () => {
    expect(parseHookPayload('{"tool_name":"Write"}')).toEqual({ tool_name: "Write" });
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["empty stdin", ""],
    ["a JSON scalar", "42"],
  ])("returns null for %s", (_label, payload) => {
    expect(parseHookPayload(payload)).toBeNull();
  });
});

describe(".claude/settings.json hook contract", () => {
  it("is valid JSON with a hooks block", () => {
    expect(settings.hooks).toBeTypeOf("object");
    expect(writeHookCommands().length).toBeGreaterThan(0);
  });

  it("references no CLAUDE_FILE_PATH variable (Claude Code never exports one)", () => {
    const offenders = writeHookCommands().filter((cmd) => cmd.includes("CLAUDE_FILE_PATH"));
    expect(offenders).toEqual([]);
  });

  it("guards every formatter invocation behind a non-empty path check", () => {
    for (const cmd of writeHookCommands().filter((c) => c.includes("npx "))) {
      expect(cmd).toContain('[ -n "$FILE" ]');
    }
  });
});

describe("hook seam: an empty file path is a no-op", () => {
  let sandbox;
  let npxLog;
  let env;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "hook-file-path-"));
    npxLog = join(sandbox, "npx-calls.log");

    writeFileSync(join(sandbox, "a.js"), UGLY_JS);
    writeFileSync(join(sandbox, ".prettierrc"), UGLY_RC);

    // Stub `npx` so a formatter fan-out is observable without touching the network.
    const bin = join(sandbox, "bin");
    mkdirSync(bin);
    const stub = join(bin, "npx");
    writeFileSync(
      stub,
      `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(npxLog)}\nexit 0\n`
    );
    chmodSync(stub, 0o755);

    env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CLAUDE_PROJECT_DIR: REPO_ROOT };
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  const run = (command, payload) =>
    spawnSync("bash", ["-c", command], { cwd: sandbox, env, input: payload, encoding: "utf8" });

  it.each([
    ["a payload with no file_path", payloadFor(undefined)],
    ["completely empty stdin", ""],
  ])(
    "leaves every hook a silent no-op given %s",
    (_label, payload) => {
      for (const command of writeHookCommands()) {
        const result = run(command, payload);
        expect(result.status, `hook exited non-zero: ${command}\n${result.stderr}`).toBe(0);
      }

      expect(existsSync(npxLog), "a formatter ran without an explicit file argument").toBe(false);
      expect(readFileSync(join(sandbox, "a.js"), "utf8")).toBe(UGLY_JS);
      expect(readFileSync(join(sandbox, ".prettierrc"), "utf8")).toBe(UGLY_RC);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "passes the real path through to prettier when one is present",
    () => {
      const target = join(sandbox, "a.js");
      const result = run(commandContaining("prettier"), payloadFor(target));

      expect(result.status).toBe(0);
      expect(readFileSync(npxLog, "utf8")).toContain(`prettier --write --ignore-unknown ${target}`);
    },
    SEAM_TIMEOUT_MS
  );
});

describe("hook seam: the PreToolUse guard blocks protected paths", () => {
  const guard = () => commandContaining("BLOCK: Do not edit .env files");

  const runGuard = (filePath) =>
    spawnSync("bash", ["-c", guard()], {
      cwd: REPO_ROOT,
      env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
      input: payloadFor(filePath),
      encoding: "utf8",
    });

  it.each([
    ["a .env file", "/repo/services/users/.env", "Do not edit .env files"],
    ["the lockfile", "/repo/pnpm-lock.yaml", "Never edit pnpm-lock.yaml"],
    [
      "an applied migration",
      "/repo/services/users/prisma/migrations/20260101_init/migration.sql",
      "Do not edit existing migrations",
    ],
    [
      "production Pulumi config",
      "/repo/infrastructure/pulumi/Pulumi.prod.yaml",
      "Production Pulumi config",
    ],
  ])(
    "blocks %s with exit 2",
    (_label, filePath, message) => {
      const result = runGuard(filePath);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(message);
    },
    SEAM_TIMEOUT_MS
  );

  it.each([
    ["ordinary source", "/repo/apps/gen/src/App.tsx"],
    ["an .env template", "/repo/services/users/.env.example"],
    ["a missing path", undefined],
  ])(
    "allows %s",
    (_label, filePath) => {
      expect(runGuard(filePath).status).toBe(0);
    },
    SEAM_TIMEOUT_MS
  );
});
