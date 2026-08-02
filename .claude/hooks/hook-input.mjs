#!/usr/bin/env node
/**
 * hook-input.mjs — print one field of the hook payload arriving on stdin.
 *
 * The shared front door for every path-aware hook in `.claude/settings.json`:
 *
 *     FILE=$(node "$CLAUDE_PROJECT_DIR/.claude/hooks/hook-input.mjs")
 *     [ -n "$FILE" ] || exit 0
 *
 * Defaults to `file_path`; pass a field name to read another
 * (`hook-input.mjs command` for Bash hooks, `hook-input.mjs tool_name`).
 *
 * Prints nothing and exits 0 when the payload carries no usable value, so the
 * `-n` guard above turns each hook into a no-op instead of an unbounded one.
 * Parsing and the measured payload contract live in scripts/hook-input.mjs,
 * where they are unit-tested.
 *
 * Fails OPEN — a hook helper must never deadlock editing, matching
 * .claude/hooks/secret-scan.mjs.
 */
import { extractHookField } from "../../scripts/hook-input.mjs";

const STDIN_TIMEOUT_MS = 2000;
const field = process.argv[2] || "file_path";

let input = "";
const timeout = setTimeout(() => process.exit(0), STDIN_TIMEOUT_MS);

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("error", () => process.exit(0));
process.stdin.on("end", () => {
  clearTimeout(timeout);
  const value = extractHookField(input, field);
  if (value) process.stdout.write(value);
  process.exit(0);
});
