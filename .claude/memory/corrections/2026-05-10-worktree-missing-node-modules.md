---
date: 2026-05-10
session: agent-dispatch
trigger: Worktree agents fail with vitest command not found or ELIFECYCLE errors
correction: Always include pnpm install --frozen-lockfile as the first step in worktree agent prompts
root_cause: Claude Code isolation worktree creates a bare git checkout without node_modules.
prevention: Documented in CLAUDE.md under Dispatching Worktree Agents. This is the number 1 recurring CI failure pattern.
feeds_back_into: CLAUDE.md#dispatching-worktree-agents, .claude/rules/gotchas.md#build--pnpm--turbo
---

## Summary

When Claude Code spawns an agent with `isolation: "worktree"`, the worktree is created as a bare git checkout — the source files are present but `node_modules` is empty. Any command that relies on local binaries (`vitest`, `pnpm exec`, `pnpm build`) will fail immediately with `command not found` or `ELIFECYCLE`. The fix is mandatory: always include `pnpm install --frozen-lockfile` as the very first step in any worktree agent prompt. This is the single most common CI failure pattern across all agent sessions. The 15-second install cost is negligible compared to the wasted token and time cost of a failed agent run.
