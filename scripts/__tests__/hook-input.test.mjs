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
  readdirSync,
  existsSync,
  rmSync,
  chmodSync,
  symlinkSync,
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
/** Every `command` hook whose matcher applies to a Bash tool call. */
function bashHookCommands() {
  const events = [...(settings.hooks?.PreToolUse ?? []), ...(settings.hooks?.PostToolUse ?? [])];
  return events
    .filter((entry) => new RegExp(entry.matcher ?? "").test("Bash"))
    .flatMap((entry) => entry.hooks ?? [])
    .filter((hook) => hook.type === "command")
    .map((hook) => hook.command);
}

const bashCommandContaining = (needle) => bashHookCommands().find((cmd) => cmd.includes(needle));

/**
 * The three hooks repaired off the fictional `$CLAUDE_BASH_COMMAND`.
 * `regen-after-update-branch.sh` is deliberately NOT here — see the
 * env-var scan below.
 */
const REPAIRED_BASH_HOOKS = ["pre-bash-guard.sh", "pre-push-typecheck.sh", "verify-push-sha.sh"];

const bashPayloadFor = (command) =>
  JSON.stringify({
    session_id: "test-session",
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command, description: "test" },
    tool_use_id: "toolu_test",
  });

describe("hook seam: Bash hooks read the command from the stdin payload", () => {
  let sandbox;
  let env;
  let pnpmLog;

  const git = (cwd, ...args) =>
    spawnSync(
      "git",
      [
        "-c",
        "user.email=hook-test@example.com",
        "-c",
        "user.name=hook-test",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd, encoding: "utf8" }
    );

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "hook-bash-cmd-"));
    pnpmLog = join(sandbox, "pnpm-calls.log");

    // The hooks resolve their input adapter via $CLAUDE_PROJECT_DIR, and
    // pre-bash-guard checks $CLAUDE_PROJECT_DIR/node_modules — so the project
    // dir is the sandbox (no node_modules), with the real hook and adapter
    // sources linked in. Node realpaths the adapter on execution, so its
    // relative import of scripts/hook-input.mjs still resolves in the repo.
    symlinkSync(join(REPO_ROOT, ".claude"), join(sandbox, ".claude"));
    symlinkSync(join(REPO_ROOT, "scripts"), join(sandbox, "scripts"));

    // Stub `pnpm` (logs its args, exits 1) so the typecheck path is
    // observable — and observably blocking — without a real workspace.
    const bin = join(sandbox, "bin");
    mkdirSync(bin);
    const stub = join(bin, "pnpm");
    writeFileSync(
      stub,
      `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(pnpmLog)}\nexit 1\n`
    );
    chmodSync(stub, 0o755);

    env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CLAUDE_PROJECT_DIR: sandbox,
    };
    delete env.SKIP_BASH_GUARD;
    delete env.SKIP_PUSH_TYPECHECK;
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  const run = (hookFile, payload, cwd = sandbox) =>
    spawnSync("bash", ["-c", bashCommandContaining(hookFile)], {
      cwd,
      env,
      input: payload,
      encoding: "utf8",
    });

  /** A work repo one unpushed .ts commit ahead of its bare origin. */
  function gitFixtureAheadOfOrigin() {
    const origin = join(sandbox, "origin.git");
    const work = join(sandbox, "work");
    git(sandbox, "init", "-q", "--bare", "-b", "main", origin);
    git(sandbox, "init", "-q", "-b", "main", work);
    writeFileSync(join(work, "a.ts"), "export const a = 1;\n");
    git(work, "add", "a.ts");
    git(work, "commit", "-qm", "init");
    git(work, "remote", "add", "origin", origin);
    git(work, "push", "-qu", "origin", "main");
    writeFileSync(join(work, "a.ts"), "export const a = 2;\n");
    git(work, "add", "a.ts");
    git(work, "commit", "-qm", "unpushed ts change");
    return work;
  }

  it("wires all three repaired hooks in settings.json under a Bash matcher", () => {
    for (const hookFile of REPAIRED_BASH_HOOKS) {
      expect(bashCommandContaining(hookFile), `${hookFile} not wired for Bash`).toBeTruthy();
    }
  });

  it(
    "pre-bash-guard blocks `pnpm test` when node_modules is missing",
    () => {
      const result = run("pre-bash-guard.sh", bashPayloadFor("pnpm test"));
      expect(result.stderr).toContain("node_modules missing");
      expect(result.status).toBe(2);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "pre-push-typecheck typechecks a `git push` with unpushed .ts changes and blocks on failure",
    () => {
      const work = gitFixtureAheadOfOrigin();
      const result = run("pre-push-typecheck.sh", bashPayloadFor("git push origin HEAD"), work);
      expect(result.stderr).toContain("BLOCK: typecheck failed");
      expect(result.status).toBe(2);
      expect(readFileSync(pnpmLog, "utf8")).toContain("-r --parallel typecheck");
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "verify-push-sha reports a push that did not land (remote behind local)",
    () => {
      const work = gitFixtureAheadOfOrigin();
      const result = run("verify-push-sha.sh", bashPayloadFor("git push origin HEAD"), work);
      expect(result.stderr).toContain("did NOT land");
      expect(result.status).toBe(2);
    },
    SEAM_TIMEOUT_MS
  );

  it.each([
    ["completely empty stdin", ""],
    ["malformed JSON", "{not json"],
    ["a payload with no command", '{"tool_name":"Bash","tool_input":{}}'],
  ])(
    "leaves every repaired Bash hook a silent no-op given %s",
    (_label, payload) => {
      // Run inside the ahead-of-origin fixture so a hook that wrongly
      // proceeded without a command would have something to trip on.
      const work = gitFixtureAheadOfOrigin();
      for (const hookFile of REPAIRED_BASH_HOOKS) {
        const result = run(hookFile, payload, work);
        expect(result.status, `hook exited non-zero: ${hookFile}\n${result.stderr}`).toBe(0);
        expect(result.stderr, `hook was not silent: ${hookFile}`).toBe("");
      }
      expect(existsSync(pnpmLog), "typecheck ran without a command in the payload").toBe(false);
    },
    SEAM_TIMEOUT_MS
  );
});

describe("no hook reads the fictional Bash-tool env vars", () => {
  const HOOKS_DIR = join(REPO_ROOT, ".claude", "hooks");
  const hookFiles = readdirSync(HOOKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  const filesContaining = (needles) =>
    hookFiles.filter((name) => {
      const text = readFileSync(join(HOOKS_DIR, name), "utf8");
      return needles.some((needle) => text.includes(needle));
    });

  it("references no CLAUDE_BASH_COMMAND anywhere under .claude/hooks/", () => {
    expect(filesContaining(["CLAUDE_BASH_COMMAND"])).toEqual([]);
  });

  it("confines CLAUDE_TOOL_INPUT/CLAUDE_TOOL_OUTPUT to the one known-inert hook", () => {
    // regen-after-update-branch.sh is deliberately left inert: repairing its
    // input would arm never-executed `git checkout origin/$branch --detach`
    // + `git push --no-verify` against the live working tree (lines 36-58).
    // Recorded in docs/backlog.md; rewrite those lines before adopting the
    // adapter there. Exact equality keeps that repair a deliberate act.
    expect(filesContaining(["CLAUDE_TOOL_INPUT", "CLAUDE_TOOL_OUTPUT"])).toEqual([
      "regen-after-update-branch.sh",
    ]);
  });
});
