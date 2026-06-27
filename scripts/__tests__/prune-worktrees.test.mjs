import { describe, it, expect } from "vitest";
import { selectStaleWorktrees } from "../prune-worktrees.mjs";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Freeze reference time so boundary tests are deterministic.
const NOW = Date.now();

describe("selectStaleWorktrees", () => {
  const WORKTREE_ROOT = "/repo/.claude/worktrees";

  it("returns empty list when given empty input", () => {
    const result = selectStaleWorktrees([], 7 * DAY_MS, WORKTREE_ROOT, NOW);
    expect(result).toEqual([]);
  });

  it("selects worktrees older than maxAgeMs", () => {
    const worktrees = [{ path: `${WORKTREE_ROOT}/agent-old`, mtimeMs: NOW - 8 * DAY_MS }];
    const result = selectStaleWorktrees(worktrees, 7 * DAY_MS, WORKTREE_ROOT, NOW);
    expect(result).toEqual([`${WORKTREE_ROOT}/agent-old`]);
  });

  it("keeps worktrees younger than maxAgeMs", () => {
    const worktrees = [{ path: `${WORKTREE_ROOT}/agent-fresh`, mtimeMs: NOW - 1 * DAY_MS }];
    const result = selectStaleWorktrees(worktrees, 7 * DAY_MS, WORKTREE_ROOT, NOW);
    expect(result).toEqual([]);
  });

  it("handles exactly-at-threshold as fresh (boundary: stale is strictly > maxAgeMs)", () => {
    const worktrees = [{ path: `${WORKTREE_ROOT}/agent-boundary`, mtimeMs: NOW - 7 * DAY_MS }];
    const result = selectStaleWorktrees(worktrees, 7 * DAY_MS, WORKTREE_ROOT, NOW);
    expect(result).toEqual([]);
  });

  it("selects only stale entries from a mixed list", () => {
    const worktrees = [
      { path: `${WORKTREE_ROOT}/agent-stale-1`, mtimeMs: NOW - 10 * DAY_MS },
      { path: `${WORKTREE_ROOT}/agent-fresh-1`, mtimeMs: NOW - 2 * DAY_MS },
      { path: `${WORKTREE_ROOT}/agent-stale-2`, mtimeMs: NOW - 30 * DAY_MS },
      { path: `${WORKTREE_ROOT}/agent-fresh-2`, mtimeMs: NOW - 6 * DAY_MS },
    ];
    const result = selectStaleWorktrees(worktrees, 7 * DAY_MS, WORKTREE_ROOT, NOW);
    expect(result).toEqual([`${WORKTREE_ROOT}/agent-stale-1`, `${WORKTREE_ROOT}/agent-stale-2`]);
  });

  it("rejects paths outside worktree root (path traversal guard)", () => {
    const worktrees = [
      { path: `/repo/.claude/worktrees/../../../etc/passwd`, mtimeMs: NOW - 10 * DAY_MS },
    ];
    expect(() => selectStaleWorktrees(worktrees, 7 * DAY_MS, WORKTREE_ROOT, NOW)).toThrow(
      /outside worktree root/
    );
  });

  it("rejects paths that do not start with worktree root", () => {
    const worktrees = [{ path: `/repo`, mtimeMs: NOW - 10 * DAY_MS }];
    expect(() => selectStaleWorktrees(worktrees, 7 * DAY_MS, WORKTREE_ROOT, NOW)).toThrow(
      /outside worktree root/
    );
  });

  it("works with configurable threshold (1 hour)", () => {
    const worktrees = [
      { path: `${WORKTREE_ROOT}/agent-2h-old`, mtimeMs: NOW - 2 * HOUR_MS },
      { path: `${WORKTREE_ROOT}/agent-30min-old`, mtimeMs: NOW - 30 * 60 * 1000 },
    ];
    const result = selectStaleWorktrees(worktrees, HOUR_MS, WORKTREE_ROOT, NOW);
    expect(result).toEqual([`${WORKTREE_ROOT}/agent-2h-old`]);
  });

  it("returns empty list when all worktrees are fresh", () => {
    const worktrees = [
      { path: `${WORKTREE_ROOT}/agent-a`, mtimeMs: NOW - 1 * HOUR_MS },
      { path: `${WORKTREE_ROOT}/agent-b`, mtimeMs: NOW - 2 * HOUR_MS },
    ];
    const result = selectStaleWorktrees(worktrees, 7 * DAY_MS, WORKTREE_ROOT, NOW);
    expect(result).toEqual([]);
  });
});
