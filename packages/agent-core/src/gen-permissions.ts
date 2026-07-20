/**
 * Shared permission policy for gen sessions (gen-runner) and agent sessions (tool-permissions).
 *
 * This module owns the authoritative blocklists so neither consumer duplicates them.
 * tool-permissions.ts imports from here for the worktree-aware agent session handler.
 * gen-runner.ts imports from here for the lightweight gen streaming handler.
 */

/** Patterns that should never be executed in any agent or gen session. */
export const BLOCKED_BASH_PATTERNS: readonly RegExp[] = [
  /\brm\s+.*\/\*/, // rm ... /*
  /\bsudo\b/, // sudo anything
  /\bcurl\b.*\|\s*\bbash\b/, // curl | bash (pipe to shell)
  /\bwget\b.*\|\s*\bbash\b/, // wget | bash
  /\bgit\s+push\b/, // git push (orchestrator handles this)
  /\bnpm\s+publish\b/, // npm publish
  /\bpnpm\s+publish\b/, // pnpm publish
];

/**
 * Detects `rm -r`/`rm -rf`/`rm --recursive` (any flag order/combination) with a
 * path argument. Token-based, not regex-based, by design (issue #3410):
 *
 * Attempt 1 nested unbounded `[a-zA-Z]*` quantifiers around a required 'r'/'f'
 * inside an optional group, e.g. `-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?`.
 * Untrusted agent-generated bash (reachable via prompt injection) fed a long run of
 * letters with no terminating whitespace forced O(n^2) backtracking: 50k 'r' chars
 * took ~7.4s — an event-loop-blocking DoS.
 *
 * Attempt 2 bounded the same quantifiers to `{0,10}` to kill the backtracking. That
 * fixed the DoS and satisfied `safe-regex`, but silently capped the flag-cluster
 * length it could detect: `rm -fffffffffffr /path` (11+ padding letters before the
 * required 'r') slipped past undetected — a real blocklist bypass caught by security
 * review on PR #3433.
 *
 * A regex can't express "any length" while staying backtrack-free once the letter
 * check is embedded inside the quantifier itself, so this splits the flag cluster
 * into tokens via `.split()` and tests each token's contents directly with
 * `.includes()`. No nested or adjacent quantifiers exist, so there is nothing
 * for a regex engine to backtrack on, and no length cap on what a token can contain.
 *
 * Attempt 3 (the first token-based rewrite) matched `rm` only as a standalone
 * whitespace-delimited token, missing the old regex's `\brm\b` word-boundary
 * semantics. Security review on PR #3433 found six bypass shapes — path-prefixed
 * (`/bin/rm -rf /x`), subshell-fused (`$(rm ...)`, `(rm ...)`), and
 * separator-fused (`a|rm ...`, `a&&rm ...`) — plus an over-block: the flag scan
 * ran to end-of-string, so `rm safe.txt && tar -rf a.tar dir` was denied.
 *
 * Current form: split the command into segments on shell separators
 * (`;`, `|`, `&`, `(`, `)`, backtick, `$`, newline — a plain character class,
 * no quantifier-around-alternation, so still no backtracking surface). Within
 * each segment, `rm` matches as a bare token or a path-prefixed token ending in
 * `/rm`, and the recursive-flag + path scan is confined to that segment's own
 * arguments — restoring `\brm\b` parity without crossing command boundaries.
 */
export function isRmRecursiveDelete(command: string): boolean {
  const segments = command.split(/[;|&()`$\n]+/);
  return segments.some(segmentIsRmRecursiveDelete);
}

/** Checks a single shell segment (no `;`/`|`/`&`/subshell separators) for `rm -r`+path. */
function segmentIsRmRecursiveDelete(segment: string): boolean {
  const tokens = segment.split(/\s+/);
  const rmIndex = tokens.findIndex((token) => token === "rm" || token.endsWith("/rm"));
  if (rmIndex === -1) return false;

  const args = tokens.slice(rmIndex + 1);
  const hasPath = args.some((arg) => arg.includes("/"));
  if (!hasPath) return false;

  return args.some((arg) => {
    if (arg === "--recursive") return true;
    if (arg.startsWith("--")) return false;
    return arg.startsWith("-") && arg.length > 1 && arg.slice(1).includes("r");
  });
}

/**
 * Structural patterns that indicate shell encoding bypass attempts.
 * These detect the *encoding mechanism* rather than the decoded payload,
 * blocking the bypass vector itself regardless of what command is hidden inside.
 */
export const ENCODING_BYPASS_PATTERNS: readonly RegExp[] = [
  // base64 decode piped to shell
  /\bbase64\s+(-d|--decode)\b.*\|\s*(sh|bash|zsh|eval)\b/,
  /\bbase64\s+(-d|--decode)\b.*\$\(/,

  // printf/echo with hex (\x..) or octal (\0..) piped to shell
  /\b(printf|echo\s+-e)\b.*\\x[0-9a-fA-F]{2}.*\|\s*(sh|bash|zsh|eval)\b/,
  /\b(printf|echo\s+-e)\b.*\\0[0-7]{1,3}.*\|\s*(sh|bash|zsh|eval)\b/,

  // $'\x..' ANSI-C quoting with hex/octal piped to shell
  /\$'[^']*\\x[0-9a-fA-F]{2}[^']*'.*\|\s*(sh|bash|zsh|eval)\b/,
  /\$'[^']*\\0[0-7]{1,3}[^']*'.*\|\s*(sh|bash|zsh|eval)\b/,

  // eval of variable expansion or subshell (eval "$cmd", eval $(…))
  /\beval\s+("|'|\$[({])/,

  // command substitution piped to shell: $(...) | sh
  /\$\([^)]+\)\s*\|\s*(sh|bash|zsh|eval)\b/,

  // generic pipe to shell execution (covers many encoding tricks)
  /\|\s*(sh|bash|zsh)\b/,

  // variable-based command execution: cmd="rm"; $cmd ...
  /\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?\s+-[a-zA-Z]*r[a-zA-Z]*f/,
  /\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?\s+-rf\b/,
];

/** Tools that are always blocked in agent and gen sessions. */
export const BLOCKED_TOOLS: ReadonlySet<string> = new Set([
  "WebSearch",
  "WebFetch",
  "AskUserQuestion",
  "EnterPlanMode",
  "EnterWorktree",
]);

/**
 * Normalize a bash command for pattern matching.
 *
 * Applies lightweight transformations so that simple obfuscation
 * (newline injection, extra whitespace) does not bypass the blocklist.
 * The original command is also checked — normalization is additive.
 */
export function normalizeBashCommand(command: string): readonly string[] {
  const variants: string[] = [command];

  // Collapse escaped newlines (line continuations)
  const collapsed = command.replace(/\\\n/g, "");
  if (collapsed !== command) {
    variants.push(collapsed);
  }

  // Split on unescaped newlines and semicolons to catch injection
  const lines = command
    .split(/(?<!\\)[;\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    for (const line of lines) {
      variants.push(line);
    }
  }

  // Collapse excess whitespace in each variant
  const withNormalizedSpace = variants.map((v) => v.replace(/\s+/g, " ").trim());
  const allVariants = [...new Set([...variants, ...withNormalizedSpace])];

  return allVariants;
}

/**
 * Check if a bash command should be blocked.
 * Returns a reason string if blocked, null if allowed.
 */
export function isBashCommandBlocked(command: string): string | null {
  const variants = normalizeBashCommand(command);

  for (const variant of variants) {
    // Check structural encoding bypass patterns first
    for (const pattern of ENCODING_BYPASS_PATTERNS) {
      if (pattern.test(variant)) {
        return `Blocked: command uses shell encoding bypass (${pattern.source})`;
      }
    }

    // Check standard blocked patterns
    for (const pattern of BLOCKED_BASH_PATTERNS) {
      if (pattern.test(variant)) {
        return `Blocked: command matches dangerous pattern ${pattern.source}`;
      }
    }

    // Check recursive rm separately — token-based, not a RegExp (see isRmRecursiveDelete doc)
    if (isRmRecursiveDelete(variant)) {
      return "Blocked: command matches dangerous pattern rm -r/-rf/--recursive with a path argument";
    }
  }

  return null;
}
