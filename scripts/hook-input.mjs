/**
 * hook-input.mjs — the one place that knows how a Claude Code hook receives input.
 *
 * ## The contract (measured, not assumed — see issue #3631)
 *
 * Claude Code exports exactly one hook environment variable: `CLAUDE_PROJECT_DIR`.
 * Verified by grepping the shipped binary (v2.1.220) for every identifier the
 * hooks in this repo read:
 *
 *     CLAUDE_PROJECT_DIR   18 hits   ← real
 *     CLAUDE_FILE_PATH      0 hits   ← never existed
 *     CLAUDE_BASH_COMMAND   0 hits   ← never existed
 *     CLAUDE_TOOL_INPUT     0 hits   ← never existed
 *
 * `"$CLAUDE_FILE_PATH"` therefore expanded to `""` in every hook that used it,
 * which silently turned `prettier --write ""` into a repo-wide reformat and made
 * `case "" in *.env|*pnpm-lock.yaml|…)` match nothing — leaving the guard on
 * `.env` files, the lockfile, applied migrations and `Pulumi.prod.yaml` inert for
 * its entire life. **Do not reach for a different environment variable.**
 *
 * Hook input arrives as JSON on **stdin**:
 *
 *     { "hook_event_name": "PreToolUse",   // or "PostToolUse"
 *       "tool_name": "Write",
 *       "tool_input": { "file_path": "/abs/path.ts", "content": "…" },
 *       "tool_use_id": "…" }
 *
 * Bash tool calls carry `tool_input.command` in the same envelope, so the hooks
 * still broken under the fictional `$CLAUDE_BASH_COMMAND` can adopt this adapter
 * unchanged via `extractHookField(payload, "command")`.
 *
 * Every field accessor returns `""` rather than throwing, so a caller can treat
 * the empty string as "no input — do nothing". Callers must never treat it as
 * "operate on everything": that is exactly the bug this module exists to prevent.
 */

/** Fields that live at the top of the envelope rather than inside `tool_input`. */
const TOP_LEVEL_FIELDS = new Set(["tool_name", "hook_event_name", "tool_use_id", "session_id"]);

/**
 * Safely parse a hook payload.
 *
 * @param {string} payload Raw stdin text.
 * @returns {object|null} The parsed envelope, or `null` when unusable.
 */
export function parseHookPayload(payload) {
  if (typeof payload !== "string" || payload.trim() === "") return null;
  try {
    const data = JSON.parse(payload);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

/**
 * Read a single string field out of a hook payload.
 *
 * @param {string} payload Raw stdin text.
 * @param {string} [field] Envelope field, or a key inside `tool_input`.
 * @returns {string} The value, or `""` when absent, non-string or unparseable.
 */
export function extractHookField(payload, field = "file_path") {
  const data = parseHookPayload(payload);
  if (!data) return "";

  const value = TOP_LEVEL_FIELDS.has(field) ? data[field] : data.tool_input?.[field];
  return typeof value === "string" ? value : "";
}

/**
 * The path of the file a Write/Edit/MultiEdit call is about to touch.
 *
 * @param {string} payload Raw stdin text.
 * @returns {string} The path, or `""` when the payload carries none.
 */
export const extractHookFilePath = (payload) => extractHookField(payload, "file_path");
