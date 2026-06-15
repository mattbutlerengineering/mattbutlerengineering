---
name: implement-queue-worker
description: Implements a single GitHub issue in an isolated worktree via TDD. Installs deps, writes a failing test first, implements, runs lint/typecheck/test gates, commits, pushes, and opens a PR targeting main. Designed to be spawned by /implement-queue with isolation: worktree.
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Skill
model: sonnet
---

> **Model:** `sonnet` is the fallback. `/implement-queue` resolves a per-issue model via `mbe check-model --issue <N>` and passes it as `model:` when dispatching — that override wins over this frontmatter. The fallback applies only when no override is passed.

# Implement Queue Worker

You are implementing a specific GitHub issue in an isolated git worktree. Your job is to:

0. **Install dependencies** — worktrees are bare checkouts without `node_modules`:

   ```bash
   pnpm install --frozen-lockfile
   ```

1. **Understand the issue** — Read the issue description carefully. Identify which files and code areas are affected. If the issue says `Depends on: #N` and #N is open, stop and report.

2. **Find the code** — Use Grep/Glob to locate the relevant files. Read them to understand the current implementation and existing patterns.

   **If the issue touches a Prisma schema or migration**, invoke the `/prisma-migrations` skill first for the house migration workflow (dev vs. prod, baselining, destructive-change rules) before writing the migration.

3. **TDD implementation** — Work in vertical slices. For each slice:
   - Write ONE failing test (RED), run it, confirm it fails
   - Write minimal code to pass (GREEN), run it, confirm it passes
   - Move to the next slice

   Key rules:
   - Immutable patterns (never mutate, create new objects)
   - Files under 800 lines, functions under 50 lines
   - Use `import type` for type-only imports
   - Double quotes, semicolons, 2-space indent, trailing commas
   - kebab-case files, camelCase functions, PascalCase types, UPPER_SNAKE constants

4. **Run gates** — Execute all three on the affected packages (run from inside the package directory, not the monorepo root):

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

   Vitest does NOT typecheck — tests can pass with wrong types. `pnpm typecheck` is mandatory before declaring done. Fix any failures; do not skip or disable tests.

   **Then run the two CI gates `pnpm test` does not cover** — these are the recurring main-breakers, so catch them here, from the repo root:

   ```bash
   # Architecture audit (ADR + dependency constraints)
   pnpm --filter @mbe/cli start check-adr && pnpm --filter @mbe/cli start check-deps
   # Generated-artifact drift — regenerate EVERYTHING from source, exactly like CI
   pnpm build --filter @mbe/cli...            # build CLI + transitive deps (agent-core) so regen runs in a bare worktree
   pnpm regen                                  # CI-EQUIVALENT: regenerate every artifact family from source
   node scripts/detect-instruction-rot.mjs    # CI runs this; catches stale instruction refs
   git status --short                          # surfaces any artifact the regen changed
   ```

   If `check-adr`/`check-deps` fail, fix the violation. **`pnpm regen` is the authoritative drift fix — run it, do not hand-pick `pack-changed`.** CI's Integrity job regenerates _from source_ and fails on any diff, so the only way to match it locally is to regenerate from source too. `pack-changed` has blind spots that have repeatedly broken the merge train: it skips the root (workspace-aggregate) `llms.txt`, skips families like `registry.json` / `generated-schemas.ts`, and misses `llms-full.txt`-only drift. `pnpm regen` covers all of them. (Note: `pnpm regen --check` is only a working-tree-vs-index `git diff` — it catches "regenerated but forgot to stage," NOT "committed artifact is stale vs source," so it is **not** a substitute for actually running `pnpm regen`.)

   If `pnpm regen` changed any artifact (`docs/architecture/dependency-graph.md`, `llms.txt`/`llms-full.txt`, `registry.json`, `generated-schemas.ts`), stage **those specific files** alongside your change (never `git add -A`). Re-run `git status --short` and confirm it is clean of generated files before committing — do not push until it is.

5. **Simplify** — Review your changes. Remove unnecessary complexity. If you added more than 20 lines, look for opportunities to simplify, then re-run gates.

6. **Commit** — Stage only your changed files (never `git add -A`):

   ```bash
   git add <specific files>
   git commit -m "fix: <description>

   Closes #<ISSUE_NUMBER>"
   ```

7. **Push and open a PR**:

   ```bash
   git push origin HEAD
   gh pr create --base main --title "<type>: <description>" --body "Closes #<ISSUE_NUMBER>

   <summary of changes and gate results>"
   gh pr view --json baseRefName --jq .baseRefName   # must print: main
   ```

   Worktree branches can fork from the wrong base — always pass `--base main` and verify. Do NOT merge the PR; the merge train in the main session handles that.

## Security rules (non-negotiable)

- Never introduce hardcoded secrets, SQL injection, XSS, or other OWASP Top 10 vulnerabilities.
- Never commit `.env` files, credentials, API keys, or tokens.
- Parameterized queries for all database operations; sanitize user input before rendering; validate external data at boundaries.
- If you discover an existing security vulnerability, stop feature work and fix it first.

## Rules

- Fix the issue described, nothing else. No drive-by refactoring.
- If you can't complete it after 3 attempts, stop and report why.
- Never modify `.github/workflows/`, `CLAUDE.md`, or `package.json` scripts unless the issue specifically requires it.
- Never add dependencies without explicit justification in the issue.
- Always run the full gate suite before committing.
