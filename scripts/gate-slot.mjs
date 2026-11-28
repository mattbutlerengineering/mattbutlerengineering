/**
 * gate-slot.mjs — decide whether a worktree gate command must wait for a free slot.
 *
 * On 2026-11-27 seven worktree workers ran lint, typecheck and test at once:
 * 86 node processes, load average ~72 on 24 threads, the Mac swapping, and
 * ~1 min gates taking 30-55 min (#10082). The PreToolUse hook
 * `.claude/hooks/gate-slot.mjs` uses this module to hold a worktree's gate
 * command until fewer than {@link GATE_SLOT_MAX} OTHER worktrees have gate
 * processes running. A worktree that already holds a slot is never held, so one
 * worker's own gates never wait on each other.
 *
 * Slots are counted from live processes (`ps`), not lock files: a PreToolUse
 * hook exits before its command runs, so it cannot hold a lock for the
 * command's lifetime. Waiters freed at the same moment can briefly overshoot
 * the cap; that is accepted over a lock that a crashed worker could leak.
 *
 * Only `.claude/worktrees/<name>` trees are gated (where Agent-tool worktree
 * workers run). The main checkout and sibling worktrees are never held.
 */

/** Maximum number of worktrees running gates at the same time. */
export const GATE_SLOT_MAX = 3;

const WORKTREE_RE = /\/\.claude\/worktrees\/([^/\s'"]+)/;

// A package-manager script that runs a gate, a turbo pipeline, or a gate binary.
const GATE_COMMAND_RE =
  /\b(?:pnpm|npm|yarn)\b[^;&|\n]*?\b(?:lint|typecheck|test|build|check:[\w:-]+)\b|\bturbo\s+run\b|\b(?:tsc|vitest|eslint)\b/;

// A gate process: a tsc/eslint/vitest/turbo binary resolved from a worktree's node_modules.
const GATE_PROCESS_RE = new RegExp(
  String.raw`/\.claude/worktrees/([^/\s'"]+)/\S*node_modules/\S*` +
    String.raw`(?:typescript/bin/tsc|eslint/bin/eslint\.js|vitest/vitest\.mjs|turbo/bin/turbo|@turbo/\S*/bin/turbo)`
);

// Shell wrappers (the Bash tool's `zsh -c …`) carry the command TEXT; they are not gate processes.
const SHELL_WRAPPER_RE = /^\S*\b(?:zsh|bash|sh)\s+-c\b/;

/** @param {string} command */
export function isGateCommand(command) {
  return GATE_COMMAND_RE.test(command ?? "");
}

/**
 * The `.claude/worktrees/<name>` tree a command targets: a path in the command
 * wins over the payload cwd. Returns "" outside such a worktree.
 * @param {string} command
 * @param {string} cwd
 */
export function worktreeOf(command, cwd) {
  return (command ?? "").match(WORKTREE_RE)?.[1] ?? (cwd ?? "").match(WORKTREE_RE)?.[1] ?? "";
}

/**
 * Worktrees with at least one gate process running.
 * @param {string} psText `ps -axo command=` output, one process per line.
 * @returns {Set<string>}
 */
export function activeGateWorktrees(psText) {
  const active = new Set();
  for (const line of (psText ?? "").split("\n")) {
    const trimmed = line.trim();
    if (SHELL_WRAPPER_RE.test(trimmed)) continue;
    const name = trimmed.match(GATE_PROCESS_RE)?.[1];
    if (name) active.add(name);
  }
  return active;
}

/**
 * @param {{ command: string, cwd: string, psText: string, max?: number }} input
 * @returns {{ wait: boolean, worktree: string, active: string[] }}
 */
export function decideGateSlot({ command, cwd, psText, max = GATE_SLOT_MAX }) {
  const worktree = isGateCommand(command) ? worktreeOf(command, cwd) : "";
  if (!worktree) return { wait: false, worktree, active: [] };
  const active = [...activeGateWorktrees(psText)];
  const wait = !active.includes(worktree) && active.length >= max;
  return { wait, worktree, active };
}
