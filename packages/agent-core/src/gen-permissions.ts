/**
 * Shared permission policy for gen sessions (gen-runner) and agent sessions (tool-permissions).
 *
 * This module owns the authoritative blocklists so neither consumer duplicates them.
 * tool-permissions.ts imports from here for the worktree-aware agent session handler.
 * gen-runner.ts imports from here for the lightweight gen streaming handler.
 */

/** Patterns that should never be executed in any agent or gen session. */
export const BLOCKED_BASH_PATTERNS: readonly RegExp[] = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?|(-[a-zA-Z]*f[a-zA-Z]*\s+)?-[a-zA-Z]*r[a-zA-Z]*\s+|--recursive\s+).*\//,
  /\brm\s+.*\/\*/, // rm ... /*
  /\bsudo\b/, // sudo anything
  /\bcurl\b.*\|\s*\bbash\b/, // curl | bash (pipe to shell)
  /\bwget\b.*\|\s*\bbash\b/, // wget | bash
  /\bgit\s+push\b/, // git push (orchestrator handles this)
  /\bnpm\s+publish\b/, // npm publish
  /\bpnpm\s+publish\b/, // pnpm publish
];

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
  }

  return null;
}
