/**
 * #9068: one dispatcher (.claude/hooks/post-edit.sh) replaced seven
 * PostToolUse Edit|Write entries in .claude/settings.json. These tests pin that
 * every step the old entries ran is still reached, by file type, that the
 * payload is parsed once, and that exit codes and advisories survive the merge.
 *
 * The dispatcher runs in a sandbox with every step stubbed to log its call, so
 * what is observed is the dispatch, not the steps (those have their own tests,
 * see hook-input.test.mjs and changeset-hook.test.mjs).
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
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEAM_TIMEOUT_MS = 60_000;
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const HOOKS_DIR = join(REPO_ROOT, ".claude", "hooks");
const DISPATCHER_SRC = readFileSync(join(HOOKS_DIR, "post-edit.sh"), "utf8");
const settings = JSON.parse(readFileSync(join(REPO_ROOT, ".claude", "settings.json"), "utf8"));

const PATH_HOOKS = [
  "check-changeset.sh",
  "check-instruction-budget.sh",
  "run-related-tests.sh",
  "regen-dep-graph.sh",
];

const payloadFor = (filePath) =>
  JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    tool_input: { file_path: filePath, content: "x" },
  });

const postEditEntries = () =>
  (settings.hooks?.PostToolUse ?? []).filter((e) => new RegExp(e.matcher ?? "").test("Write"));

describe("post-edit dispatcher wiring", () => {
  it("is the only PostToolUse Edit|Write command, so the payload is parsed once", () => {
    const commands = postEditEntries().flatMap((e) => e.hooks.map((h) => h.command));
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain("post-edit.sh");
    expect(commands[0]).not.toContain("hook-input.mjs");
  });

  it("keeps a timeout covering the per-step caps (60 s tests + 30 s regen)", () => {
    const [hook] = postEditEntries().flatMap((e) => e.hooks);
    expect(hook.timeout).toBeGreaterThanOrEqual(90);
    expect(DISPATCHER_SRC).toContain(
      'run_timed 60 bash "$PROJECT_DIR/.claude/hooks/run-related-tests.sh"'
    );
    expect(DISPATCHER_SRC).toContain(
      'run_timed 30 bash "$PROJECT_DIR/.claude/hooks/regen-dep-graph.sh"'
    );
  });

  it.each([
    ...PATH_HOOKS,
    "check-destructive-migrations.js",
    "npx prettier --write --ignore-unknown",
    "npx eslint --fix",
  ])("still reaches %s", (step) => {
    expect(DISPATCHER_SRC).toContain(step);
  });

  it("runs eslint on .mjs as well as ts/tsx/js/jsx", () => {
    expect(DISPATCHER_SRC).toContain("*.ts | *.tsx | *.js | *.jsx | *.mjs)");
  });
});

describe("post-edit dispatcher behaviour", () => {
  let sandbox;
  let log;
  let env;

  const stub = (path, body) => {
    writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(path, 0o755);
  };
  const logCall = (name) => `printf '${name} %s\\n' "$*" >> ${JSON.stringify(log)}`;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "post-edit-"));
    log = join(sandbox, "calls.log");
    const hooks = join(sandbox, ".claude", "hooks");
    mkdirSync(hooks, { recursive: true });
    mkdirSync(join(sandbox, "scripts"));
    const bin = join(sandbox, "bin");
    mkdirSync(bin);

    writeFileSync(join(hooks, "post-edit.sh"), DISPATCHER_SRC);
    // Node realpaths the symlink, so hook-input's relative import still resolves.
    symlinkSync(join(HOOKS_DIR, "hook-input.mjs"), join(hooks, "hook-input.mjs"));
    for (const name of PATH_HOOKS) stub(join(hooks, name), logCall(name));
    writeFileSync(
      join(sandbox, "scripts", "check-destructive-migrations.js"),
      `require("node:fs").appendFileSync(${JSON.stringify(log)}, "migrations " + process.argv.slice(2).join(" ") + "\\n");\n`
    );
    stub(join(bin, "npx"), logCall("npx"));

    env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CLAUDE_PROJECT_DIR: sandbox };
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  const hookPath = (name) => join(sandbox, ".claude", "hooks", name);
  const dispatch = (input) =>
    spawnSync("bash", [hookPath("post-edit.sh")], {
      cwd: sandbox,
      env,
      input,
      encoding: "utf8",
    });
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8") : "");

  it(
    "runs formatters and every path hook for an existing .mjs file, eslint included",
    () => {
      const file = join(sandbox, "a.mjs");
      writeFileSync(file, "export {};\n");
      const result = dispatch(payloadFor(file));

      expect(result.status).toBe(0);
      const out = calls();
      expect(out).toContain(`npx prettier --write --ignore-unknown ${file}`);
      expect(out).toContain(`npx eslint --fix ${file}`);
      for (const name of PATH_HOOKS)
        expect(out, `${name} not reached`).toContain(`${name} ${file}`);
      expect(out).not.toContain("migrations");
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "skips eslint for non-JS files and runs the destructive-migration check for migration.sql",
    () => {
      const dir = join(sandbox, "prisma", "migrations", "1_x");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, "migration.sql");
      writeFileSync(file, "select 1;\n");

      expect(dispatch(payloadFor(file)).status).toBe(0);
      const out = calls();
      expect(out).toContain("npx prettier");
      expect(out).not.toContain("npx eslint");
      expect(out).toContain(`migrations --file ${file}`);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "still runs the path hooks, but no formatter, for a file that does not exist",
    () => {
      const file = join(sandbox, "gone.ts");
      dispatch(payloadFor(file));
      const out = calls();
      expect(out).not.toContain("npx");
      for (const name of PATH_HOOKS) expect(out).toContain(`${name} ${file}`);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "is a silent no-op when the payload carries no path",
    () => {
      for (const input of ["", JSON.stringify({ tool_input: { content: "x" } })]) {
        const result = dispatch(input);
        expect(result.status).toBe(0);
        expect(result.stdout).toBe("");
      }
      expect(calls()).toBe("");
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "propagates a blocking exit 2 from the budget step and still runs later steps",
    () => {
      stub(hookPath("check-instruction-budget.sh"), "echo over budget >&2\nexit 2");
      const result = dispatch(payloadFor(join(sandbox, "CLAUDE.md")));

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("over budget");
      expect(calls()).toContain("regen-dep-graph.sh");
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "merges advisories from several steps into one JSON line",
    () => {
      const advisory = (text) =>
        `printf '%s\\n' '${JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } })}'`;
      stub(hookPath("check-changeset.sh"), advisory("needs changeset"));
      stub(hookPath("run-related-tests.sh"), advisory("test failed"));
      const result = dispatch(payloadFor(join(sandbox, "gone.ts")));

      const lines = result.stdout.trim().split("\n");
      expect(lines).toHaveLength(1);
      const merged = JSON.parse(lines[0]).hookSpecificOutput;
      expect(merged.hookEventName).toBe("PostToolUse");
      expect(merged.additionalContext).toContain("needs changeset");
      expect(merged.additionalContext).toContain("test failed");
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "passes a single advisory through unchanged",
    () => {
      const line = JSON.stringify({
        hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "only one" },
      });
      stub(hookPath("check-changeset.sh"), `printf '%s\\n' '${line}'`);
      const result = dispatch(payloadFor(join(sandbox, "gone.ts")));
      expect(result.stdout.trim()).toBe(line);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "kills a step that outruns its cap without hanging the dispatcher",
    () => {
      // Shrink the cap so the test is fast; the mechanism is what is pinned.
      writeFileSync(
        hookPath("post-edit.sh"),
        DISPATCHER_SRC.replace("run_timed 30 bash", "run_timed 1 bash")
      );
      stub(hookPath("regen-dep-graph.sh"), "sleep 30");
      const started = Date.now();
      const result = dispatch(payloadFor(join(sandbox, "gone.ts")));
      expect(result.status).toBe(0);
      expect(Date.now() - started).toBeLessThan(15_000);
    },
    SEAM_TIMEOUT_MS
  );
});
