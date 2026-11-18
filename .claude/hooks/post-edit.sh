#!/usr/bin/env bash
# PostToolUse dispatcher for Edit|Write (#9068).
#
# Replaces seven separate settings.json entries that each spawned
# `node hook-input.mjs` (plus a bash) per edit. The payload is parsed ONCE here
# and the relevant steps run by file type, each step keeping the behaviour,
# timeout and worktree resolution it had as its own hook:
#
#   prettier                      every file (--ignore-unknown)
#   eslint --fix                  .ts .tsx .js .jsx .mjs   (.mjs added in #9068)
#   check-destructive-migrations  migration.sql
#   check-changeset.sh            advisory, JSON on stdout
#   check-instruction-budget.sh   blocking (exit 2)
#   run-related-tests.sh          advisory, JSON on stdout, 60 s cap
#   regen-dep-graph.sh            30 s cap
#
# Worktree semantics live in the step scripts, which resolve the edited file's
# own tree (gotchas.md); this script passes the path through unchanged and runs
# prettier/eslint from the inherited cwd exactly as before.
#
# Output contract: PostToolUse JSON (`additionalContext`) from several steps is
# merged into ONE JSON line, because concatenated JSON objects do not parse.
# Exit: 2 if any step blocked (budget), else the first non-zero step code, else
# 0. Every step runs even when an earlier one blocked, as when they were
# separate hooks. Fails OPEN on an empty/absent path. bash 3.2-compatible.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

FILE=$(node "$PROJECT_DIR/.claude/hooks/hook-input.mjs")
[ -n "$FILE" ] || exit 0

# Runs "$@" with a wall-clock cap in seconds, stdin closed. The watchdog's
# output is detached so a captured `$(...)` is not held open until it sleeps out.
run_timed() {
  local secs="$1" pid wd rc
  shift
  "$@" </dev/null &
  pid=$!
  ( sleep "$secs"; pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null ) >/dev/null 2>&1 &
  wd=$!
  wait "$pid"
  rc=$?
  kill "$wd" 2>/dev/null
  wait "$wd" 2>/dev/null
  # Killed by the cap (SIGTERM/SIGKILL): advisory steps just stop, as when the
  # harness killed them on their own timeout; not an error to propagate.
  if [ "$rc" -eq 143 ] || [ "$rc" -eq 137 ]; then rc=0; fi
  return "$rc"
}

exit_code=0
context=""

# Records a step's exit code: a blocking 2 wins, else the first non-zero.
note_code() {
  if [ "$1" -eq 2 ]; then
    exit_code=2
  elif [ "$1" -ne 0 ] && [ "$exit_code" -eq 0 ]; then
    exit_code="$1"
  fi
}

# Appends a step's stdout (PostToolUse JSON lines) to the merged context.
add_context() {
  if [ -n "$1" ]; then
    context="${context:+$context
}$1"
  fi
}

if [ -f "$FILE" ]; then
  npx prettier --write --ignore-unknown "$FILE" </dev/null >/dev/null || true
  case "$FILE" in
    *.ts | *.tsx | *.js | *.jsx | *.mjs) npx eslint --fix "$FILE" </dev/null >/dev/null || true ;;
  esac
fi

case "$FILE" in
  */migrations/*/migration.sql | */prisma/migrations/*/migration.sql)
    node "$PROJECT_DIR/scripts/check-destructive-migrations.js" --file "$FILE" </dev/null >&2
    note_code $?
    ;;
esac

out=$(bash "$PROJECT_DIR/.claude/hooks/check-changeset.sh" "$FILE" </dev/null)
note_code $?
add_context "$out"

bash "$PROJECT_DIR/.claude/hooks/check-instruction-budget.sh" "$FILE" </dev/null
note_code $?

out=$(run_timed 60 bash "$PROJECT_DIR/.claude/hooks/run-related-tests.sh" "$FILE")
note_code $?
add_context "$out"

run_timed 30 bash "$PROJECT_DIR/.claude/hooks/regen-dep-graph.sh" "$FILE" >/dev/null
note_code $?

if [ -n "$context" ]; then
  if [ "$(printf '%s\n' "$context" | wc -l | tr -d ' ')" -le 1 ]; then
    printf '%s\n' "$context"
  else
    # Several advisories: merge their additionalContext into one JSON line.
    CONTEXT="$context" node -e '
      const parts = process.env.CONTEXT.split("\n").filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line).hookSpecificOutput.additionalContext]; }
        catch { return [line]; }
      });
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: parts.join("\n\n") } }) + "\n");
    '
  fi
fi

exit "$exit_code"
