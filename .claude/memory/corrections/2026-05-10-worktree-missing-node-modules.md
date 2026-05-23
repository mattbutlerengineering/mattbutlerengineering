---
date: 2026-05-10
session: agent-dispatch
trigger: Worktree agents fail with vitest command not found or ELIFECYCLE errors
correction: Always include pnpm install --frozen-lockfile as the first step in worktree agent prompts
root_cause: Claude Code isolation worktree creates a bare git checkout without node_modules.
prevention: Documented in CLAUDE.md under Dispatching Worktree Agents. This is the number 1 recurring CI failure pattern.
---
