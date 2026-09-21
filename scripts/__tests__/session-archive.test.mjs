/**
 * Seam tests for `.claude/hooks/session-archive.sh` — the Stop hook that
 * archives `.claude/session-summary.md` into `.claude/sessions/`.
 *
 * The hook is executed for real, in a throwaway sandbox project dir, in the
 * style of `scripts/__tests__/hook-input.test.mjs`. Nothing here writes to the
 * repo: the sandbox is a temp dir and `CLAUDE_PROJECT_DIR` points at it.
 *
 * What these pin (#5598): the hook's guard used to be
 * `grep -q "_YYYY-MM-DD_" "$SUMMARY" && exit 0`, and `session-summary.md` was
 * both the template and the live scratchpad — so the placeholder it grepped for
 * was permanently present and the skip branch was taken unconditionally. Zero
 * summaries were archived between #910 and #5598. The regression these tests
 * exist to catch is any guard that can never pass (or one that fires on an
 * untouched template and fills the archive with noise).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  copyFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const HOOK = join(REPO_ROOT, ".claude", "hooks", "session-archive.sh");
const REAL_TEMPLATE = join(REPO_ROOT, ".claude", "session-summary.template.md");
const REAL_SCRATCHPAD = join(REPO_ROOT, ".claude", "session-summary.md");
const REAL_ARCHIVE_DIR = join(REPO_ROOT, ".claude", "sessions");

const STOP_PAYLOAD = JSON.stringify({
  session_id: "test-session",
  hook_event_name: "Stop",
  stop_hook_active: false,
});

/** A summary with real content — and the `_YYYY-MM-DD_` placeholder still in an unfilled row. */
const FILLED_SUMMARY = readFileSync(REAL_TEMPLATE, "utf8").replace(
  "- _Lesson 1_",
  "- A guard that greps for a marker the file always contains can never fire."
);

let sandbox;

/** Absolute path inside the sandbox project. */
const inSandbox = (...parts) => join(sandbox, ...parts);

/** Archived summaries, excluding the directory's own README. */
const archived = () =>
  existsSync(inSandbox(".claude", "sessions"))
    ? readdirSync(inSandbox(".claude", "sessions")).filter((f) => f !== "README.md")
    : [];

/** Execute the real hook against the sandbox, the way the Stop event does. */
function runHook({ projectDir = sandbox, withProjectDir = true } = {}) {
  const env = { ...process.env };
  if (withProjectDir) env.CLAUDE_PROJECT_DIR = projectDir;
  else delete env.CLAUDE_PROJECT_DIR;

  return spawnSync("bash", [HOOK], {
    cwd: projectDir,
    env,
    input: STOP_PAYLOAD,
    encoding: "utf8",
  });
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "session-archive-"));
  mkdirSync(inSandbox(".claude", "sessions"), { recursive: true });
  writeFileSync(inSandbox(".claude", "sessions", "README.md"), "# Sessions\n");
  copyFileSync(REAL_TEMPLATE, inSandbox(".claude", "session-summary.template.md"));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("session-archive.sh: an untouched template is not archived", () => {
  it("stays silent when the scratchpad is byte-identical to the shipped template", () => {
    copyFileSync(REAL_TEMPLATE, inSandbox(".claude", "session-summary.md"));

    const result = runHook();

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("Archived");
    expect(archived()).toEqual([]);
  });

  it("stays silent when the scratchpad is blank", () => {
    writeFileSync(inSandbox(".claude", "session-summary.md"), "   \n\n");

    expect(runHook().status).toBe(0);
    expect(archived()).toEqual([]);
  });
});

describe("session-archive.sh: real content is archived", () => {
  beforeEach(() => {
    writeFileSync(inSandbox(".claude", "session-summary.md"), FILLED_SUMMARY);
  });

  it("archives a filled-in summary that still carries the _YYYY-MM-DD_ placeholder", () => {
    // The placeholder sitting in an unfilled metadata row is the whole point:
    // it is what the dead guard keyed on, and it says nothing about content.
    expect(FILLED_SUMMARY).toContain("_YYYY-MM-DD_");

    const result = runHook();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Archived session summary to");
    expect(archived()).toHaveLength(1);

    const copy = readFileSync(inSandbox(".claude", "sessions", archived()[0]), "utf8");
    expect(copy).toBe(FILLED_SUMMARY);
  });

  it("names the archive after the UTC date", () => {
    runHook();
    expect(archived()[0]).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}(-\d+)?\.md$/);
  });

  it("does not re-archive an unchanged scratchpad on the next session end", () => {
    runHook();
    const result = runHook();

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("Archived");
    expect(archived()).toHaveLength(1);
  });

  it("archives again once the scratchpad changes", () => {
    runHook();
    writeFileSync(
      inSandbox(".claude", "session-summary.md"),
      `${FILLED_SUMMARY}\n- Second session.\n`
    );

    expect(runHook().status).toBe(0);
    expect(archived()).toHaveLength(2);
  });
});

describe("session-archive.sh: fails open", () => {
  it.each([
    [
      "no scratchpad exists",
      () => {
        /* template only */
      },
    ],
    [
      "the template is missing",
      () => {
        rmSync(inSandbox(".claude", "session-summary.template.md"));
        writeFileSync(inSandbox(".claude", "session-summary.md"), FILLED_SUMMARY);
      },
    ],
  ])("exits 0 and archives nothing when %s", (_label, arrange) => {
    arrange();

    expect(runHook().status).toBe(0);
    expect(archived()).toEqual([]);
  });

  it("exits 0 when it cannot resolve a project root at all", () => {
    // No CLAUDE_PROJECT_DIR, and the sandbox is not a git repo.
    const result = runHook({ withProjectDir: false });

    expect(result.status).toBe(0);
    expect(archived()).toEqual([]);
  });

  it("creates the archive directory rather than giving up when it is missing", () => {
    rmSync(inSandbox(".claude", "sessions"), { recursive: true, force: true });
    writeFileSync(inSandbox(".claude", "session-summary.md"), FILLED_SUMMARY);

    expect(runHook().status).toBe(0);
    expect(archived()).toHaveLength(1);
  });
});

describe("session-archive.sh: against this repo's committed state", () => {
  it("stays silent, because the committed scratchpad is already in .claude/sessions/", () => {
    // A faithful replica of the repo's own .claude/ — if the committed
    // scratchpad were not already archived verbatim, every session end would
    // deposit a duplicate of a summary nobody wrote this session (#5598's
    // "that is noise" objection to repairing the guard alone).
    copyFileSync(REAL_SCRATCHPAD, inSandbox(".claude", "session-summary.md"));
    for (const file of readdirSync(REAL_ARCHIVE_DIR)) {
      copyFileSync(join(REAL_ARCHIVE_DIR, file), inSandbox(".claude", "sessions", file));
    }

    const result = runHook();

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("Archived");
    expect(archived()).toEqual(readdirSync(REAL_ARCHIVE_DIR).filter((f) => f !== "README.md"));
  });
});
