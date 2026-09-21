---
date: 2026-09-21
session: pr-issue-drain
trigger: Diagnosing an ACMM drift report, I read plugins/acmm/scripts/substance.js from the working tree and found a checker with no date logic at all — then grepped the whole repo for the evidence string the live audit had emitted and found nothing, and briefly concluded the audit must be running code from outside the repo
correction: Read every file from `git show origin/main:<path>` when reasoning about what CI or a scheduled routine actually ran; never trust the working tree's copy
root_cause: "The primary checkout was 417 commits behind origin/main. `git status` reports clean because the tree matches its own stale HEAD, so nothing signals the gap. The stale substance.js genuinely had no recency window; the current one on origin/main has a documented 90-day window and emits exactly the string I had failed to find."
prevention: "Run `git rev-list --count HEAD..origin/main` at the start of any session that reasons about current repo behaviour, and prefer `git show origin/main:<path>` for every read. Warn dispatched review and worker subagents explicitly — they inherit the same stale checkout and will otherwise flag already-fixed bugs. Every worker dispatched in this session was instructed to `git fetch origin main && git checkout -B <branch> origin/main` as step 0 for this reason."
feeds_back_into: .claude/rules/gotchas.md#build--pnpm--turbo, CLAUDE.md#dispatching-worktree-agents
---

## Summary

This is a recurrence, not a new discovery — the class is already recorded — which is itself the point worth capturing. The trap survives documentation because the misleading signal is `git status` reporting a clean tree, and clean reads as current. Nothing in the normal workflow surfaces the distance from origin.

The failure is not merely "read an old file". It is that the old file was internally coherent and plausible, so the wrong conclusion drawn from it was confident: I nearly reported that the nightly audit was executing an acmm build from outside the repository. A stale read does not look like an error, it looks like an answer.

The cheap guard is the one-line distance check before any reasoning about current behaviour, and `git show origin/main:<path>` as the default read verb whenever the question is "what does CI run today".
