import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/**
 * Drift guard for the eval checkpoint's callers (maintenance run
 * `agent-eval-claude-cli-caller`).
 *
 * `mbe agent eval` defaults to the Claude SDK adapter, which needs
 * `ANTHROPIC_API_KEY`; the claude.ai RemoteTrigger sandbox has no such key by
 * standing decision (#3571/#3585), so every scheduled caller that omits
 * `--adapter claude-cli` exits 2 (`suiteDidNotRun`) forever. That is exactly
 * what happened: the adapter landed in #5670 and the routine prompt kept
 * invoking the default, with every gate green, so `metrics/eval-reports.jsonl`
 * stayed 0 bytes. Every file whose text can make an agent run eval is guarded
 * here; `docs/scheduled-tasks.md` is intent prose with historical mentions and
 * is deliberately not.
 *
 * Text reads only — no YAML/TS imports — matching pulumi-cli-pin.test.mjs and
 * apps/rialto-web/e2e/workflow-coverage.test.ts. `VALID_ADAPTERS` is not
 * exported from agent-eval.ts, and tools/cli/dist is not guaranteed built in
 * the scripts project, so the code-side facts are asserted textually too.
 *
 * v2 (amendment 2026-09-29): the v1 same-line `includes` passed Verify's M1
 * mutation — flag stripped from the command, a prose mention of it left on
 * the same line. v2 pins the exact invocation and requires EVERY word-bounded
 * `agent eval` occurrence to be immediately followed by the flag (word-bounded
 * so "run the agent evaluation suite" stays prose).
 */
const ADAPTER_FLAG = "--adapter claude-cli";
const INVOCATION = "agent eval";
const EXACT_INVOCATION = `node tools/cli/dist/index.js ${INVOCATION} ${ADAPTER_FLAG}`;
/** An `agent eval` occurrence not immediately followed by the flag. */
const UNFLAGGED_INVOCATION = /\bagent eval\b(?! --adapter claude-cli)/;

const GUARDED_FILES = [
  "docs/routines/mbe-weekly-improve.md",
  "docs/routines/mbe-evening.md",
  ".claude/skills/optimize-implement-queue/SKILL.md",
];

const WEEKLY_IMPROVE = "docs/routines/mbe-weekly-improve.md";
const CLI_ADAPTER = "packages/agent-core/src/adapters/claude-cli-adapter.ts";
const EVAL_COMMAND = "tools/cli/src/commands/agent-eval.ts";

/** Deterministic title the routine files (and dedupes on) when exit 2 happens under claude-cli. */
const NO_RUN_ISSUE_TITLE = "ci-fix: weekly eval checkpoint did not run under claude-cli";
/** The pre-fix clause that made the weekly non-run read as fine. */
const SILENT_NO_OP_CLAUSE = "treat it as a silent no-op";
/** Step 4's exit-0 clause for a task that ran and then failed (amendment 2026-09-29). */
const SCORED_FAILURE_ROW = "scored failure row";
/** A cause the exit-2 diagnostic cannot distinguish, so step 4 must not assert it. */
const UNKNOWABLE_CAUSE = "refused to start";

const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

/** Every line (1-based number + text) with an `agent eval` not followed by the flag. */
function unflaggedLines(text) {
  return text
    .split("\n")
    .map((line, i) => ({ number: i + 1, line }))
    .filter(({ line }) => UNFLAGGED_INVOCATION.test(line));
}

describe("eval callers name the runnable adapter", () => {
  describe.each(GUARDED_FILES)("%s", (rel) => {
    it(`contains the exact invocation \`${EXACT_INVOCATION}\` — a zero-match pass would pin nothing`, () => {
      // A guard that passes when the invocation vanishes is the class
      // gotchas.md forbids: the routine could silently stop running eval and
      // this file would stay green.
      expect(
        read(rel).includes(EXACT_INVOCATION),
        `${rel} no longer contains \`${EXACT_INVOCATION}\` — restore the invocation, ` +
          "or remove this file from GUARDED_FILES if the caller is obsolete."
      ).toBe(true);
    });

    it(`follows every \`${INVOCATION}\` with \`${ADAPTER_FLAG}\``, () => {
      const offending = unflaggedLines(read(rel)).map(
        ({ number, line }) => `${rel}:${number}: ${line.trim()}`
      );

      expect(
        offending,
        `\`${INVOCATION}\` not immediately followed by \`${ADAPTER_FLAG}\` in:\n  ${offending.join("\n  ")}\n` +
          "The default adapter is the Claude SDK and needs ANTHROPIC_API_KEY, which the " +
          "routine sandbox does not have (#3571/#3585), so this caller can never score. " +
          'Add the flag, reword the prose mention (e.g. "an invocation without that flag"), ' +
          "or delete the stale mention if the caller is obsolete."
      ).toEqual([]);
    });
  });
});

describe("the adapter the callers name still exists in the code", () => {
  it(`${CLI_ADAPTER} declares the "claude-cli" adapter name`, () => {
    expect(read(CLI_ADAPTER)).toContain('readonly name = "claude-cli"');
  });

  it(`${EVAL_COMMAND} accepts "claude-cli" in VALID_ADAPTERS`, () => {
    const source = read(EVAL_COMMAND);
    const start = source.indexOf("const VALID_ADAPTERS");
    expect(start, "VALID_ADAPTERS array literal not found").toBeGreaterThan(-1);
    const end = source.indexOf("];", start);
    expect(end, "VALID_ADAPTERS array literal is unterminated").toBeGreaterThan(start);
    expect(source.slice(start, end)).toContain('"claude-cli"');
  });
});

describe("the weekly-improve prompt treats a claude-cli non-run as a failure", () => {
  it(`files the deterministic issue title \`${NO_RUN_ISSUE_TITLE}\``, () => {
    expect(read(WEEKLY_IMPROVE)).toContain(NO_RUN_ISSUE_TITLE);
  });

  it(`no longer calls exit 2 "${SILENT_NO_OP_CLAUSE}"`, () => {
    expect(read(WEEKLY_IMPROVE)).not.toContain(SILENT_NO_OP_CLAUSE);
  });

  it(`calls a task that ran and then failed a "${SCORED_FAILURE_ROW}", not a non-run`, () => {
    expect(read(WEEKLY_IMPROVE)).toContain(SCORED_FAILURE_ROW);
  });

  it(`does not assert the undistinguishable cause "${UNKNOWABLE_CAUSE}"`, () => {
    expect(read(WEEKLY_IMPROVE)).not.toContain(UNKNOWABLE_CAUSE);
  });
});
