---
name: gotcha-harvest
description: "Harvest discovery-driven lessons from autonomous loops. Scans a session (or --days N of history) for 'CI/check failed → fix → passed' arcs and recurring tool-errors, then proposes entries for .claude/rules/gotchas.md (repo-specific) or your frontmatter-per-fact memory (cross-repo). Use after /implement-queue or /ship-loop runs, or invoke /gotcha-harvest. Complements /reflect, which is correction-driven and misses these."
user-invocable: true
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, AskUserQuestion, TodoWrite
---

# Gotcha Harvest

`/reflect` captures **corrections** — places where a human told the agent "no, do X." Autonomous loops (`/implement-queue`, `/ship-loop`) rarely produce those; their lessons are **discovery-driven**: a CI check fails, the agent diagnoses and fixes it, the check passes. That arc is the richest source of reusable gotchas and `/reflect` structurally never sees it. This skill harvests it.

**Output is a proposal, never a silent write.** Always show findings and get a human decision before editing any file.

## Arguments

- (none) — scan the **current session** transcript only.
- `--days N` — scan all project session files modified in the last N days (default 7 when the flag is bare).
- `--dry-run` — show proposals, write nothing.

## Process

### Step 0: Track the run

Use TodoWrite with: locate transcripts → detect arcs → synthesize gotchas → dedupe → route → review → apply.

### Step 1: Locate transcripts

```bash
# current project's session folder (paths have / replaced by -)
ls ~/.claude/projects/ | grep -i "$(basename "$(pwd)" | tr '_' '-')"
```

- No flag → the most recent non-`agent-*` `.jsonl` (current session).
- `--days N` → every `*.jsonl` (including `agent-*.jsonl` — workers hit the recurring drift/typecheck failures) modified within N days.

### Step 2: Detect failure→fix→pass arcs

Scan the transcript(s) for this shape, in order:

1. **A signal of a check failing** — a tool result or assistant line containing CI/build feedback. Anchor patterns (case-insensitive):
   - `❌`, `FAIL`, `exit code 1`, `ELIFECYCLE`, `Process completed with exit code`
   - named checks: `CI Gate`, `Integrity`, `Build`, `typecheck`, `lint`, `instruction rot`, `dependency-graph.md is stale`, `llms.txt … out of sync`, `frozen-lockfile`, `check-adr`, `check-deps`
2. **An action taken in response** — an Edit/Write/Bash between the failure and the recovery (regenerate, rebase, add a step, change a value).
3. **A recovery signal** — a later "all pass" / green / merged / "✓" for the same check.

Also collect **recurring tool-errors**: the same error class (e.g. `@mbe/agent-core … not built`, `vitest: command not found`, lockfile desync) appearing **2+ times** across the scanned scope — these are gotchas even without a clean arc.

Discard one-off transient failures with no fix and no recurrence.

### Step 3: Synthesize a one-line gotcha per arc

Imperative, cause→fix, ≤2 lines. Mirror the existing `gotchas.md` voice (terse, concrete, command-bearing). Example shapes:

- "Deleting a workspace package drifts the **root** llms.txt — `pnpm pack-changed` misses it; regenerate with `node tools/cli/dist/index.js pack .` and run `detect-instruction-rot.mjs`."
- "Worktree agents must `pnpm build --filter @mbe/agent-core...` before `tools/cli` typecheck — fresh checkouts have no dist."

### Step 4: Dedupe against existing knowledge

```bash
grep -niE "<keyword>" .claude/rules/gotchas.md
```

If a near-match exists, propose **merge/refine** rather than a new bullet. Also skip lessons **already encoded this session** into a skill/agent/PR (check `git log --oneline origin/main..HEAD` and the session for edits that already fixed it) — re-proposing what you just shipped is noise.

### Step 5: Route each gotcha

| Kind of lesson | Destination | How |
| --- | --- | --- |
| Repo CI / build / pre-commit / drift / release / deploy / Prisma | `.claude/rules/gotchas.md` | append a bullet under the matching `## ` section (Pre-commit / Pre-push / Build / CI / Dependencies / Releases / Tooling / Auth0 · E2E / Prisma · DO migrate) |
| Cross-repo Claude Code / harness / tooling fact (true outside this repo) | frontmatter-per-fact memory | see **Memory schema** below |
| Workflow/process correction tied to a specific skill | that skill's `SKILL.md` | only when it changes how the skill should behave |

If no `## ` section fits a repo gotcha, propose a new section header.

### Step 6: Review, then apply

Present a compact table (`#`, gotcha, destination, new/merge), then `AskUserQuestion`: Apply all / Select / Skip. On `--dry-run`, stop here. Apply with `Edit` (stage specific files only — never `git add -A`). Report what landed where.

## Memory schema (cross-repo facts)

Cross-repo facts go to `~/.claude/projects/<project>/memory/` as **one file per fact** with this frontmatter — the same schema as `MEMORY.md`, so the manual memory protocol, this skill, and any future `/reflect` auto-memory all converge on one format (resolves the two-schema split in that directory):

```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary used for recall>
metadata:
  type: feedback | reference
---

<the fact. **Why:** … **How to apply:** … Link related facts with [[their-name]].>
```

After writing the file, add one index line to `MEMORY.md`: `- [Title](file.md) — hook`. Never put fact bodies in `MEMORY.md`.

## Relationship to `/reflect`

- `/reflect` → human corrections, routed to CLAUDE.md / rules / skills. Run it for interactive sessions.
- `/gotcha-harvest` → agent-discovered CI/build lessons, routed to `gotchas.md` / memory. Run it after autonomous loops.

They are complementary; running both loses nothing because each dedupes against the shared targets.
