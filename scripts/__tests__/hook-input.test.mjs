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
  realpathSync,
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

  // The envelope's top-level `cwd` is the only field that tells a hook which
  // TREE a tool call runs in: hooks themselves always run with CWD =
  // $CLAUDE_PROJECT_DIR = the main checkout, even for a worktree-isolated
  // subagent (measured 2026-10-15).
  it("reads the session working directory from the top of the envelope", () => {
    const payload = JSON.stringify({
      ...JSON.parse(payloadFor("/a.ts")),
      cwd: "/repo/.claude/worktrees/agent-x",
    });
    expect(extractHookField(payload, "cwd")).toBe("/repo/.claude/worktrees/agent-x");
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
 */
const REPAIRED_BASH_HOOKS = ["pre-bash-guard.sh", "pre-push-typecheck.sh", "verify-push-sha.sh"];

const bashPayloadFor = (command, cwd) =>
  JSON.stringify({
    session_id: "test-session",
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command, description: "test" },
    tool_use_id: "toolu_test",
    ...(cwd ? { cwd } : {}),
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
    // pre-bash-guard falls back to $CLAUDE_PROJECT_DIR/node_modules when the
    // payload names no cwd — so the project dir is the sandbox (no
    // node_modules), with the real hook and adapter sources linked in. Node realpaths the adapter on execution, so its
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
    // An installed tree: pre-push-typecheck now refuses to typecheck a tree
    // with no node_modules (see the install-hint test below), and this
    // fixture is the one whose typecheck must actually reach `pnpm`.
    mkdirSync(join(work, "node_modules"));
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

  /**
   * A work repo whose own branch was never pushed, plus a LINKED WORKTREE on a
   * different branch that is fully pushed and up to date.
   *
   * This is the shape every agent worktree takes: the hook runs with
   * cwd = $CLAUDE_PROJECT_DIR (the main checkout, sitting on some unrelated
   * branch) while the push it is verifying came from the worktree.
   */
  function gitFixtureWithPushedWorktree() {
    const origin = join(sandbox, "origin.git");
    const work = join(sandbox, "work");
    const tree = join(sandbox, "linked");
    git(sandbox, "init", "-q", "--bare", "-b", "main", origin);
    git(sandbox, "init", "-q", "-b", "main", work);
    writeFileSync(join(work, "a.ts"), "export const a = 1;\n");
    git(work, "add", "a.ts");
    git(work, "commit", "-qm", "init");
    git(work, "remote", "add", "origin", origin);
    git(work, "push", "-qu", "origin", "main");
    // The main checkout moves to a branch that exists ONLY locally.
    git(work, "checkout", "-qb", "local-only-branch");
    // A linked worktree on its own branch, pushed and in sync.
    git(work, "worktree", "add", "-q", "-b", "feature", tree, "main");
    writeFileSync(join(tree, "b.ts"), "export const b = 1;\n");
    git(tree, "add", "b.ts");
    git(tree, "commit", "-qm", "worktree change");
    git(tree, "push", "-q", "origin", "feature");
    return { work, tree };
  }

  it(
    "verify-push-sha stays silent for a pushed branch when the main checkout is on another branch",
    () => {
      // Regression: the hook resolved the branch with `rev-parse --abbrev-ref
      // HEAD` in its own CWD, so a push from a linked worktree was checked
      // against the MAIN checkout's branch. That branch is typically not on
      // origin, producing "branch '<other>' not found on origin" after a push
      // that landed perfectly — and a guard that cries wolf gets ignored.
      const { work } = gitFixtureWithPushedWorktree();
      const result = run("verify-push-sha.sh", bashPayloadFor("git push -u origin feature"), work);
      expect(result.stderr, "false alarm on a push that landed").toBe("");
      expect(result.status).toBe(0);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "verify-push-sha still reports a branch that exists locally but never reached the remote",
    () => {
      // The fix must not blind the hook. `local-only-branch` is real here — it
      // is the branch the main checkout sits on — but it was never pushed, so
      // naming it in the command is exactly the failure this guard exists for.
      const { work } = gitFixtureWithPushedWorktree();
      const result = run(
        "verify-push-sha.sh",
        bashPayloadFor("git push -u origin local-only-branch"),
        work
      );
      expect(result.stderr).toContain("not found on");
      expect(result.status).toBe(2);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "verify-push-sha ignores a command that only mentions a push in its text",
    () => {
      // Regression: the matcher was a bare substring test, so ANY command whose
      // text contained the words fired the hook — a heredoc writing this very
      // test file, a comment, an echo. Two of six false firings in one session
      // were this, not the worktree bug above.
      const { work } = gitFixtureWithPushedWorktree();
      const result = run(
        "verify-push-sha.sh",
        bashPayloadFor('echo "reminder: git push origin local-only-branch later"'),
        work
      );
      expect(result.stderr, "fired on a command that pushes nothing").toBe("");
      expect(result.status).toBe(0);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "verify-push-sha still fires for a real push after a shell separator",
    () => {
      // The matcher must stay generous about where a push can appear: erring
      // toward firing is cheap, missing a push that silently failed is not.
      const { work } = gitFixtureWithPushedWorktree();
      const result = run(
        "verify-push-sha.sh",
        bashPayloadFor("cd . && git push -u origin local-only-branch"),
        work
      );
      expect(result.stderr).toContain("not found on");
      expect(result.status).toBe(2);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "verify-push-sha resolves a src:dst refspec against the remote side",
    () => {
      const { work } = gitFixtureWithPushedWorktree();
      const result = run(
        "verify-push-sha.sh",
        bashPayloadFor("git push origin feature:feature"),
        work
      );
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    },
    SEAM_TIMEOUT_MS
  );

  /**
   * The worktree-isolated subagent case, as measured 2026-10-15: hooks run
   * with CWD = $CLAUDE_PROJECT_DIR = the main checkout (an installed tree on
   * some unrelated branch), while the command they are guarding runs in a
   * bare linked worktree. Only the payload's top-level `cwd` names that tree.
   */
  function gitFixtureWithUnpushedWorktreeChange() {
    const { work, tree } = gitFixtureWithPushedWorktree();
    writeFileSync(join(tree, "b.ts"), "export const b = 2;\n");
    git(tree, "add", "b.ts");
    git(tree, "commit", "-qm", "unpushed worktree ts change");
    git(tree, "branch", "--set-upstream-to=origin/feature");
    return { work, tree };
  }

  it(
    "pre-bash-guard checks node_modules in the tree named by the payload cwd, not the project dir",
    () => {
      // Before the fix the guard read $CLAUDE_PROJECT_DIR/node_modules — the
      // main checkout's, which exist — and let `pnpm test` in a bare worktree
      // through: the exact case its own header says it blocks.
      mkdirSync(join(sandbox, "node_modules"));
      const { tree } = gitFixtureWithPushedWorktree();
      const result = run("pre-bash-guard.sh", bashPayloadFor("pnpm test", tree));
      expect(result.stderr).toContain("node_modules missing");
      expect(result.stderr).toContain("linked");
      expect(result.status).toBe(2);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "pre-bash-guard allows `pnpm test` in an installed worktree even when the project dir is bare",
    () => {
      const { tree } = gitFixtureWithPushedWorktree();
      mkdirSync(join(tree, "node_modules"));
      const result = run("pre-bash-guard.sh", bashPayloadFor("pnpm test", tree));
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "pre-push-typecheck typechecks the worktree named by the payload cwd, not the hook's own tree",
    () => {
      // Before the fix the hook resolved upstream, unpushed commits and the
      // typecheck itself in its own CWD. For a push from a linked worktree
      // that is the main checkout — here on `local-only-branch` with no
      // upstream at all — so the guard exited 0 without typechecking anything.
      const { work, tree } = gitFixtureWithUnpushedWorktreeChange();
      mkdirSync(join(tree, "node_modules"));
      const result = run(
        "pre-push-typecheck.sh",
        bashPayloadFor("git push -u origin feature", tree),
        work
      );
      expect(result.stderr).toContain("BLOCK: typecheck failed");
      expect(result.status).toBe(2);
      expect(readFileSync(pnpmLog, "utf8")).toContain("-r --parallel typecheck");
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "pre-push-typecheck blocks with the install hint when the pushed tree has no node_modules",
    () => {
      // Reachable only now that the hook looks at the right tree: a worktree
      // that never ran `pnpm install` cannot typecheck, and "fix the type
      // errors above" would blame the wrong thing.
      const { work, tree } = gitFixtureWithUnpushedWorktreeChange();
      const result = run(
        "pre-push-typecheck.sh",
        bashPayloadFor("git push origin feature", tree),
        work
      );
      expect(result.stderr).toContain("node_modules missing");
      expect(result.status).toBe(2);
      expect(existsSync(pnpmLog), "typecheck ran in a tree with no node_modules").toBe(false);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "pre-push-typecheck ignores a command that only mentions a push in its text",
    () => {
      // Same bare-substring regression verify-push-sha fixed: a heredoc or
      // echo containing the words ran a 30-60s typecheck for nothing.
      const work = gitFixtureAheadOfOrigin();
      const result = run(
        "pre-push-typecheck.sh",
        bashPayloadFor('echo "reminder: git push origin main later"'),
        work
      );
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(existsSync(pnpmLog), "typechecked a command that pushes nothing").toBe(false);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "verify-push-sha resolves a bare `git push` against the worktree named by the payload cwd",
    () => {
      // Closes the residual the hook's own header recorded: a bare push names
      // no branch, so HEAD is the only answer — and the hook's HEAD was the
      // main checkout's, reporting on `local-only-branch` after a worktree push.
      const { work, tree } = gitFixtureWithUnpushedWorktreeChange();
      const result = run("verify-push-sha.sh", bashPayloadFor("git push", tree), work);
      expect(result.stderr).toContain("remote 'feature' is BEHIND local");
      expect(result.stderr).not.toContain("local-only-branch");
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

  it(
    "pre-bash-guard warns (but does not block) an inert-hooks checkout before `git commit`",
    () => {
      // #5766: a fresh `git init` never configures core.hooksPath — exactly
      // the "pnpm install never ran" state. Claude Code (2.1.282) shows
      // NEITHER stdout nor stderr for a PreToolUse hook that exits 0, so a
      // plain stderr warning is invisible to the user — the warning must be
      // the PreToolUse JSON output contract on stdout instead: additionalContext
      // reaches the model, systemMessage reaches the user. The commit itself
      // must not be blocked (WARN, not BLOCK — see check-hooks-active.mjs's header).
      const work = gitFixtureAheadOfOrigin();
      const result = run("pre-bash-guard.sh", bashPayloadFor("git commit -m more"), work);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput.hookEventName).toBe("PreToolUse");
      expect(output.hookSpecificOutput.additionalContext).toContain("pnpm install");
      expect(output.systemMessage).toContain("pnpm install");
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "pre-bash-guard stays silent (no stdout, no stderr) before `git push` once hooks are active",
    () => {
      const work = gitFixtureAheadOfOrigin();
      mkdirSync(join(work, ".husky", "_"), { recursive: true });
      writeFileSync(join(work, ".husky", "_", "pre-commit"), "#!/bin/sh\n");
      git(work, "config", "core.hooksPath", ".husky/_");
      const result = run("pre-bash-guard.sh", bashPayloadFor("git push origin HEAD"), work);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
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

  it("references no CLAUDE_TOOL_INPUT/CLAUDE_TOOL_OUTPUT anywhere under .claude/hooks/", () => {
    expect(filesContaining(["CLAUDE_TOOL_INPUT", "CLAUDE_TOOL_OUTPUT"])).toEqual([]);
  });
});

/**
 * The three PostToolUse path hooks resolve a repo root of their own, because
 * each one has to `cd` somewhere before it can run a repo-relative command
 * (`node scripts/regen-manifest.mjs`, `node scripts/changeset-hook.mjs`) and
 * before it can strip `file_path` down to the repo-root-relative form those
 * callees expect.
 *
 * They used to resolve it from `$CLAUDE_PROJECT_DIR`, which — as measured
 * 2026-10-15 and recorded in `.claude/rules/gotchas.md` — is the MAIN checkout
 * even for a worktree-isolated subagent. For an edit inside a linked worktree
 * that was wrong twice over: the regen ran against the main checkout (so the
 * worktree's own generated artifacts stayed stale and its PR shipped them that
 * way, failing CI's Integrity/Build check), and the `rel_path` strip no-opped
 * (the main checkout's prefix does not match a worktree path), so the callee
 * got an absolute path where it expected a repo-root-relative one.
 *
 * The edited file's own tree is the tree the edit happened in, so that is what
 * these hooks resolve now — `$CLAUDE_PROJECT_DIR` stays only as the fallback.
 *
 * `scripts/regen-manifest.mjs` and `scripts/changeset-hook.mjs` are stubbed
 * per-tree here, each printing a marker naming the tree it was loaded from.
 * That keeps these tests about the one thing the hooks own — which tree they
 * act on — and leaves the real manifest and the real changeset rule to their
 * own unit tests.
 */
describe("hook seam: path hooks act on the tree the edited file lives in", () => {
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

  /**
   * A main checkout plus a LINKED WORKTREE on its own branch — the shape every
   * `isolation: "worktree"` subagent runs in. Both trees carry their own
   * stubbed `scripts/`, so which tree a hook used is directly observable.
   */
  function fixtureWithWorktree() {
    const work = join(sandbox, "work");
    const tree = join(sandbox, "linked");
    git(sandbox, "init", "-q", "-b", "main", work);
    mkdirSync(join(work, "packages", "rialto", "src"), { recursive: true });
    writeFileSync(join(work, "packages", "rialto", "package.json"), "{}\n");
    // Tracked, so the directory actually exists in the linked worktree — git
    // does not carry empty directories, and without this the src-path hooks
    // would fall back to the project dir for a fixture reason, not a real one.
    writeFileSync(join(work, "packages", "rialto", "src", "index.ts"), "export const x = 1;\n");
    git(work, "add", "-A");
    git(work, "commit", "-qm", "init");
    git(work, "worktree", "add", "-q", "-b", "feature", tree, "main");

    for (const [label, dir] of [
      ["work", work],
      ["linked", tree],
    ]) {
      mkdirSync(join(dir, "scripts"), { recursive: true });
      // Echoes the tree it was loaded from AND the path it was handed, so one
      // stub covers both halves of the bug (wrong tree, unstripped path).
      writeFileSync(
        join(dir, "scripts", "regen-manifest.mjs"),
        `console.log(JSON.stringify([{ id: "f", label: "f", command: "pnpm regen-from-${label} " + process.argv[3], outputs: ["artifact.txt"] }]));\n`
      );
      writeFileSync(
        join(dir, "scripts", "changeset-hook.mjs"),
        `console.log("advisory-from-${label} " + process.argv[2]);\n`
      );
    }
    return { work, tree };
  }

  beforeEach(() => {
    // realpath: these tests compare a git-derived path (`rev-parse
    // --show-toplevel` always reports a realpath) against fixture paths built
    // from tmpdir(), and on macOS tmpdir() is a symlink (/var -> /private/var).
    // Without this the assertions below fail there for a reason unrelated to
    // the hooks.
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "hook-tree-root-")));
    pnpmLog = join(sandbox, "pnpm-calls.log");

    symlinkSync(join(REPO_ROOT, ".claude"), join(sandbox, ".claude"));

    const bin = join(sandbox, "bin");
    mkdirSync(bin);
    // Logs the regen command and the directory it ran in.
    const stub = join(bin, "pnpm");
    writeFileSync(
      stub,
      `#!/usr/bin/env bash\nprintf '%s @ %s\\n' "$*" "$PWD" >> ${JSON.stringify(pnpmLog)}\nexit 0\n`
    );
    chmodSync(stub, 0o755);

    env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  /** Runs one hook the way `.claude/settings.json` does: path as $1. */
  const runHook = (hookFile, filePath, projectDir) =>
    spawnSync("bash", [join(sandbox, ".claude", "hooks", hookFile), filePath], {
      cwd: projectDir,
      env: { ...env, CLAUDE_PROJECT_DIR: projectDir },
      encoding: "utf8",
    });

  it(
    "regen-dep-graph regenerates in the worktree that was edited, not the main checkout",
    () => {
      const { work, tree } = fixtureWithWorktree();
      const result = runHook(
        "regen-dep-graph.sh",
        join(tree, "packages", "rialto", "package.json"),
        work
      );

      expect(result.status).toBe(0);
      const log = readFileSync(pnpmLog, "utf8");
      expect(log, "regen ran against the main checkout's manifest").toContain("regen-from-linked");
      expect(log, "regen ran in the main checkout").toContain(`@ ${tree}`);
      expect(log).not.toContain("regen-from-work");
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "regen-dep-graph hands the manifest a repo-root-relative path, not an absolute one",
    () => {
      // The manifest's `changedBy` matchers are written against repo-root-
      // relative paths; an unstripped absolute path is what made this silent.
      const { work, tree } = fixtureWithWorktree();
      runHook("regen-dep-graph.sh", join(tree, "packages", "rialto", "package.json"), work);

      const log = readFileSync(pnpmLog, "utf8");
      const [args] = log.split(" @ ");
      expect(args).toContain("packages/rialto/package.json");
      expect(args, "manifest was handed an absolute path").not.toContain(tree);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "regen-llms regenerates in the worktree that was edited, not the main checkout",
    () => {
      const { work, tree } = fixtureWithWorktree();
      const result = runHook(
        "regen-llms.sh",
        join(tree, "packages", "rialto", "src", "index.ts"),
        work
      );

      expect(result.status).toBe(0);
      const log = readFileSync(pnpmLog, "utf8");
      expect(log).toContain("regen-from-linked");
      expect(log).toContain("packages/rialto/src/index.ts");
      expect(log).not.toContain("regen-from-work");
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "check-changeset consults the worktree's changeset rule, not the main checkout's",
    () => {
      const { work, tree } = fixtureWithWorktree();
      const result = runHook(
        "check-changeset.sh",
        join(tree, "packages", "rialto", "src", "index.ts"),
        work
      );

      expect(result.status).toBe(0);
      expect(result.stderr, "advisory came from the main checkout").toContain(
        "advisory-from-linked"
      );
      expect(result.stderr).not.toContain("advisory-from-work");
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "still resolves the ordinary main-checkout edit (no worktree involved)",
    () => {
      // The fix must not regress the common case: an edit in the main checkout
      // resolves to that same checkout.
      const { work } = fixtureWithWorktree();
      const result = runHook(
        "regen-dep-graph.sh",
        join(work, "packages", "rialto", "package.json"),
        work
      );

      expect(result.status).toBe(0);
      const log = readFileSync(pnpmLog, "utf8");
      expect(log).toContain("regen-from-work");
      expect(log).toContain(`@ ${work}`);
      expect(log).toContain("packages/rialto/package.json");
    },
    SEAM_TIMEOUT_MS
  );

  it.each(["regen-dep-graph.sh", "regen-llms.sh"])(
    "%s hands the manifest a repo-root-relative path when the edit reaches the tree through a symlink",
    (hook) => {
      // `rev-parse --show-toplevel` reports a realpath; a payload path spelled
      // through a symlink must still strip down to the repo-root-relative form,
      // or the manifest matches nothing and the hook silently no-ops.
      const { work } = fixtureWithWorktree();
      const link = join(sandbox, "via-link");
      symlinkSync(work, link);
      const file =
        hook === "regen-llms.sh"
          ? join(link, "packages", "rialto", "src", "index.ts")
          : join(link, "packages", "rialto", "package.json");

      const result = runHook(hook, file, work);

      expect(result.status).toBe(0);
      const [args] = readFileSync(pnpmLog, "utf8").split(" @ ");
      expect(args, "manifest was handed a path through the symlink").not.toContain(link);
      expect(args).toMatch(/ packages\/rialto\/(src\/index\.ts|package\.json)\n?$/);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "falls back to the project dir when the path names no git tree",
    () => {
      // Fail-safe: a path outside any repo must leave the hooks silent no-ops
      // rather than erroring or acting on an unrelated tree.
      const { work } = fixtureWithWorktree();
      const outside = join(sandbox, "outside", "package.json");
      mkdirSync(join(sandbox, "outside"), { recursive: true });
      writeFileSync(outside, "{}\n");

      const result = runHook("regen-dep-graph.sh", outside, work);
      expect(result.status).toBe(0);
    },
    SEAM_TIMEOUT_MS
  );
});
