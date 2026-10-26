# @mbe/agent-core reference

Session pipeline, module map, `SessionConfig` and the multi-CLI adapters, moved out of [CLAUDE.md](../CLAUDE.md) so they don't load into context every time an agent-core file is read. The source of truth is `src/`.

## Architecture — Session Pipeline

```
taskDescription
  → createWorktree (isolated git branch)
  → buildSystemPrompt (task + source files + PR examples + CLAUDE.md + failure memory)
  → query() via Claude Agent SDK (streamed with stuck detection)
  → commitChanges
  → runVerification (lint + typecheck + tests via Turborepo --filter=...[HEAD~1])
  → evaluateSuccess (LLM judge — skipped for trivial diffs)
  → analyzeDiff (fast static analysis — no AI)
  → reviewDiff (AI security review — secrets, XSS, SQLi, a11y)
  → createPullRequest (draft if any gate fails)
  → runFeedbackLoop (poll for review comments + CI failures, auto-fix)
  → removeWorktree (cleanup)
```

Entry point: `runSession(config, onEvent?)` in `session-runner.ts`.

## Key Modules

| Module                    | Responsibility                                                              |
| ------------------------- | --------------------------------------------------------------------------- |
| `session-runner.ts`       | Main pipeline — orchestrates all stages, emits `SessionEvent`s              |
| `prompt-builder.ts`       | Assembles system prompt with quality checklist, source files, PR examples   |
| `worktree-manager.ts`     | Git worktree/clone lifecycle, commit, push, lockfile sync, verification     |
| `run-git.ts`              | Shared `runGit` primitive — arg-array + timeout + typed `GitCommandError`   |
| `stuck-detector.ts`       | Detects agent loops via fingerprinting (actions, observations, text)        |
| `success-evaluator.ts`    | LLM-as-judge evaluation with acceptance criteria extraction                 |
| `model-router.ts`         | Routes issues to haiku/sonnet/opus based on labels + complexity keywords    |
| `feedback-loop.ts`        | Polls PR for review comments and CI failures, dispatches fix sessions       |
| `tool-permissions.ts`     | Sandboxes agent — blocks dangerous bash, restricts file writes to worktree  |
| `orchestrator.ts`         | Meta-agent that decomposes tasks into parallel child sessions via MCP tools |
| `task-decomposer.ts`      | Builds orchestrator prompt with decomposition guidelines                    |
| `diff-reviewer.ts`        | AI security review of the git diff                                          |
| `diff-static-analyzer.ts` | Fast regex-based static analysis (no LLM cost)                              |
| `cost-tracker.ts`         | Extracts cost/token/duration from SDK result messages                       |
| `failure-memory.ts`       | Persists past failures for context in future sessions                       |
| `source-resolver.ts`      | Auto-resolves source files from task description                            |
| `task-signal-registry.ts` | Registry of task signals used to route and enrich agent prompts             |
| `gate-runner.ts`          | Runs quality gates in sequence; aggregates pass/fail results                |
| `circuit-breaker.ts`      | Stops cascading failures by tracking error rates and tripping open          |
| `deploy-verifier.ts`      | Verifies a deployment reached a healthy state after PR merge                |
| `revert-detector.ts`      | Detects whether a commit reverts a prior change                             |
| `pr-risk-classifier.ts`   | Classifies PR risk level (low/medium/high) to gate auto-merge decisions     |
| `budget-calculator.ts`    | Computes per-session cost budgets from model, turn count, and token limits  |
| `retry.ts`                | Generic retry with backoff; detects `ContextWindowExhaustedError`           |
| `pr-creator.ts`           | Builds PR title/body, calls `gh pr create`                                  |
| `dep-bump-merger.ts`      | Fast-path: direct-merges trivial dependency bumps that pass all gates       |

## SessionConfig

```typescript
interface SessionConfig {
  taskDescription: string; // What the agent should do
  repoPath: string; // Absolute path to the git repo
  baseBranch: string; // Default: "main"
  model: string; // Default: "claude-sonnet-5"
  maxTurns: number; // Default: 50
  maxBudgetUsd: number; // Default: 1.00
  allowedTools: string[]; // Default: Read, Write, Edit, Glob, Grep, Bash, NotebookEdit
  createPr: boolean; // Default: true (false keeps worktree for inspection)
  evaluateSuccess?: boolean; // Default: true — LLM evaluation of the diff
  sourceFiles?: string[]; // Pre-loaded file contents injected into prompt
  feedbackLoop?: FeedbackLoopConfig; // Poll for PR feedback, auto-fix
  stuckDetectorConfig?: Partial<StuckDetectorConfig>;
}
```

## Multi-CLI Adapters

Supports dispatching agent tasks to Claude Code (SDK), OpenCode CLI, Grok CLI, or Oh My Pi via a unified `AgentAdapter` interface.

### Architecture

```
SessionConfig (task + worktree + model)
  → FailoverSessionAdapter (priority-cascade, ADR-017 `auto` mode)
    → RateLimitDetector (per-adapter cooldown tracking)
    → Try adapters in order: claude → opencode (`grok`, `omp`, and `claude-cli` are explicit-only)
    → Skip if rate-limited or CLI/SDK not available
    → Throw AllAdaptersUnavailableError when all are exhausted
```

### Adapters

| Adapter            | Backend                        | CLI binary | Key behavior                                                                                                     |
| ------------------ | ------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `ClaudeAdapter`    | Claude Agent SDK               | `claude`   | Native SDK integration via `runSession()`                                                                        |
| `ClaudeCliAdapter` | Claude CLI (subscription auth) | `claude`   | Subprocess: `claude -p <task> --output-format json` — explicit-selection only, NOT in the `auto` cascade (#3585) |
| `OpenCodeAdapter`  | OpenCode CLI                   | `opencode` | Subprocess: `opencode run --json`                                                                                |
| `GrokCliAdapter`   | Grok CLI                       | `grok`     | Headless subprocess. Explicit only — not in the `auto` cascade.                                                  |
| `OmpCliAdapter`    | Oh My Pi CLI                   | `omp`      | Headless subprocess. Explicit only — not in the `auto` cascade. A Claude router model id is not forwarded.       |

### Key Modules

| Module                                 | Responsibility                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `cli-adapter.ts`                       | `AgentAdapter` interface, `AdapterConfig`, `AdapterResult` types                                |
| `adapters/cli-adapter-base.ts`         | Shared template-method base class for subprocess-based CLI adapters                             |
| `adapters/claude-adapter.ts`           | Wraps `runSession()` as an adapter                                                              |
| `adapters/claude-cli-adapter.ts`       | Subprocess dispatch to the `claude` CLI — keyless alternative to `ClaudeAdapter` (#3585)        |
| `adapters/opencode-adapter.ts`         | Subprocess dispatch to OpenCode CLI                                                             |
| `adapters/grok-adapter.ts`             | Subprocess dispatch to the Grok CLI — explicit only, not in the `auto` cascade                  |
| `adapters/omp-adapter.ts`              | Subprocess dispatch to Oh My Pi — explicit only, not in the `auto` cascade                      |
| `rate-limit-detector.ts`               | Tracks consecutive failures and cooldown expiry per adapter                                     |
| `adapters/failover-session-adapter.ts` | Priority-cascade dispatch (ADR-017 `auto`), throws `AllAdaptersUnavailableError` when exhausted |

### Usage via CLI

```bash
mbe agent run "task" --adapter auto        # Failover: claude → opencode
mbe agent run "task" --adapter opencode    # Direct dispatch to OpenCode CLI
mbe agent run "task" --adapter claude      # Default — uses Claude SDK directly
mbe agent run "task" --adapter claude-cli  # Claude CLI subprocess — no ANTHROPIC_API_KEY needed
mbe agent run "task" --adapter grok        # Grok CLI subprocess — not in `auto`
mbe agent run "task" --adapter omp         # Oh My Pi subprocess — not in `auto`
```
