# GEMINI.md - Context for Gemini CLI Agent

> This file contains mandates specific to the **Gemini CLI Agent**.
> For core project context, architecture, and code style, see [AGENTS.md](./AGENTS.md).

## Core reference

- **Primary Source of Truth:** [AGENTS.md](./AGENTS.md)
- **Roadmap & State:** See `.planning/ROADMAP.md` and `.planning/STATE.md`.

## Gemini-Specific Mandates

### 1. Directives First

Prioritize direct implementation over inquiries. If a task is clear, proceed immediately. If a task is complex, use the `gsd-planner` sub-agent.

### 2. RIPER Workflow

Strictly follow the **RIPER** (Research, Innovate, Plan, Execute, Review) cycle defined in **`AGENTS.md`**. Signal your phase with `<riper:phase>` tokens. **No file edits are permitted in the Research phase.**

### 3. Silent TDD Mode

Before executing any logic changes, write a failing Vitest/Playwright test, write the minimal code to pass it, and refactor (Red-Green-Refactor). Do this autonomously without asking for permission. Break large tasks into 5-minute atomic micro-tasks.

### 4. Extreme Speed

Use sub-agents (`codebase_investigator`, `generalist`, `gsd-executor`) aggressively for multi-file or repetitive tasks to keep the main session context lean.

### 5. Validation & Goal-Backward Verification

A task is not complete until it satisfies the original requirements and passes all automated tests. Always perform the **Zero-Touch Audit** (defined in [AGENTS.md](./AGENTS.md)) before committing:

- **Verifications:** Run `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- **Update Generated Files:** Run `pnpm build && mbe pack` and `pnpm --dir tools/mbe generate-dep-graph` if needed.

### 6. Performance Logging

Always run `mbe log-session` before finalizing a directive to quantify process improvements. Track research turns (discovery) vs. execution turns (coding/testing).

### 7. Model Verification

For high-complexity tasks (milestones, architectural refactors), run `mbe check-model` to verify you are using the correct tier (Sonnet/Opus). Report your current model version if asked.

## ACMM Audit

Score the repo against the AI Codebase Maturity Model (6-level rubric, 100+ criteria). This is a plain Node.js script — invoke directly:

```bash
node plugins/acmm/scripts/audit.js              # Dry run — scores repo, writes report
node plugins/acmm/scripts/audit.js --apply       # Also files GitHub issues for next-level gaps
node plugins/acmm/scripts/audit.js --badge        # Also rewrites README badge
node plugins/acmm/scripts/audit.js --trend        # Print level history
```

Run as part of your review phase to verify the repo's AI-operability score hasn't regressed.
See [docs/acmm/TASKS.md](./docs/acmm/TASKS.md) for current improvement goals.

## AI Context Catalog

- `llms.txt` — Rialto component catalog (UI patterns).
- `llms-full.txt` — Detailed prop tables and advanced examples.
- `AGENTS.md` — Core guidelines for all AI agents.
