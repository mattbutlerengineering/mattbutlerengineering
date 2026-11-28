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
 * Slots are counted from live processes, not lock files: a PreToolUse hook
 * exits before its command runs, so it cannot hold a lock for the command's
 * lifetime. A gate process is attributed to a worktree by an absolute
 * `.claude/worktrees/<name>/` path in its argv, else by its cwd: `pnpm exec`
 * starts binaries with a relative argv (`node ./node_modules/.bin/../vitest/…`).
 * Waiters freed at the same moment can briefly overshoot the cap; that is
 * accepted over a lock that a crashed worker could leak.
 *
 * Only `.claude/worktrees/<name>` trees are gated (where Agent-tool worktree
 * workers run). The main checkout and sibling worktrees are never held.
 */

/** Maximum number of worktrees running gates at the same time. */
export const GATE_SLOT_MAX = 3;

const WORKTREE_RE = /\/\.claude\/worktrees\/([^/\s'"]+)/;

// Unambiguous on purpose (#10128): the dash run is one or two dashes then a word character, and
// a space-separated value never starts with "-", so each flag parses one way. The earlier
// `--?[\w-]+(?:[ =]…)?` could split "--x" two ways and backtracked exponentially (30 flags: 234 s).
const OPTS = String.raw`(?:\s+--?\w[\w-]*(?:=[^\s;&|]+|\s+(?!-)[^\s;&|]+)?)*`;
const GATE_BIN = String.raw`(?:tsc|vitest|eslint)(?=\s|$)|turbo\s+run\b`;
// Each pattern is tested at the start of one shell segment (command position).
const GATE_SEGMENT_RES = [
  // pnpm/npm/yarn [opts] [run] <gate script>
  new RegExp(
    String.raw`^(?:pnpm|npm|yarn)${OPTS}\s+(?:run\s+)?(?:lint|typecheck|test|build|check)(?::[\w:-]+)?(?=\s|$)`
  ),
  // pnpm/yarn [opts] exec|dlx <gate binary>, npx <gate binary>
  new RegExp(String.raw`^(?:(?:pnpm|yarn)${OPTS}\s+(?:exec|dlx)|npx)\s+(?:${GATE_BIN})`),
  // pnpm/yarn [opts] turbo run (turbo as a package bin without exec)
  new RegExp(String.raw`^(?:pnpm|yarn)${OPTS}\s+turbo\s+run\b`),
  // a gate binary invoked directly, by name or path
  new RegExp(String.raw`^(?:\S*/)?(?:${GATE_BIN})`),
];

// A gate binary's entry point in a process argv, relative or absolute.
const GATE_PROCESS_RE =
  /(?:typescript\/bin\/tsc|eslint\/bin\/eslint\.js|vitest\/vitest\.mjs|turbo\/bin\/turbo|@turbo\/\S*\/bin\/turbo)(?:\s|$)/;

// Shell wrappers (the Bash tool's `zsh -c …`) carry the command TEXT; they are not gate processes.
const SHELL_WRAPPER_RE = /^\S*\b(?:zsh|bash|sh)\s+-c\b/;

// Leading `VAR=value` assignments and process wrappers (`timeout 120`, `time`, `nice -n 10`).
const PREFIX_RE =
  /^(?:[A-Za-z_]\w*=\S*|timeout(?:\s+-\S+)*\s+\d+[smhd]?|time|nice(?:\s+-n\s+-?\d+|\s+-\d+)?)\s+/;

const stripPrefixes = (segment) => {
  let rest = segment;
  for (let next = rest.replace(PREFIX_RE, ""); next !== rest; next = rest.replace(PREFIX_RE, "")) {
    rest = next;
  }
  return rest;
};

/** Split a shell command into segments and strip leading assignments and wrappers. */
const segments = (command) =>
  (command ?? "")
    .split(/[;&|\n]+/)
    .map((s) => stripPrefixes(s.trim()))
    .filter(Boolean);

/** @param {string} command */
export function isGateCommand(command) {
  return segments(command).some((seg) => GATE_SEGMENT_RES.some((re) => re.test(seg)));
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
 * Gate processes from `ps -axo pid=,command=` output.
 * @param {string} psText
 * @returns {{ pid: number, command: string }[]}
 */
export function gateProcesses(psText) {
  const procs = [];
  for (const line of (psText ?? "").split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    if (!m) continue;
    const command = m[2];
    if (SHELL_WRAPPER_RE.test(command) || !GATE_PROCESS_RE.test(command)) continue;
    procs.push({ pid: Number(m[1]), command });
  }
  return procs;
}

/**
 * pid → cwd from `lsof -a -d cwd -Fn -p <pids>` output.
 * @param {string} lsofText
 * @returns {Map<number, string>}
 */
export function parseLsofCwds(lsofText) {
  const cwds = new Map();
  let pid = 0;
  for (const line of (lsofText ?? "").split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid) cwds.set(pid, line.slice(1));
  }
  return cwds;
}

/**
 * Worktrees with at least one gate process running.
 * @param {{ command: string, cwd?: string }[]} procs
 * @returns {Set<string>}
 */
export function activeGateWorktrees(procs) {
  const active = new Set();
  for (const { command, cwd } of procs ?? []) {
    const name = worktreeOf(command, cwd ?? "");
    if (name) active.add(name);
  }
  return active;
}

/**
 * @param {{ command: string, cwd: string, procs: { command: string, cwd?: string }[], max?: number }} input
 * @returns {{ wait: boolean, worktree: string, active: string[] }}
 */
export function decideGateSlot({ command, cwd, procs, max = GATE_SLOT_MAX }) {
  const worktree = isGateCommand(command) ? worktreeOf(command, cwd) : "";
  if (!worktree) return { wait: false, worktree, active: [] };
  const active = [...activeGateWorktrees(procs)];
  const wait = !active.includes(worktree) && active.length >= max;
  return { wait, worktree, active };
}
