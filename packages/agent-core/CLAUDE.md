# @mbe/agent-core

Autonomous coding agent runtime. Manages the full lifecycle: worktree creation, Claude SDK session, quality gates, PR creation, and feedback loops.

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
| `task-intelligence.ts`    | Auto-resolves source files from task description, fetches PR examples       |
| `retry.ts`                | Generic retry with backoff; detects `ContextWindowExhaustedError`           |
| `pr-creator.ts`           | Builds PR title/body, calls `gh pr create`                                  |
| `dep-bump-merger.ts`      | Fast-path: direct-merges trivial dependency bumps that pass all gates       |

## SessionConfig

```typescript
interface SessionConfig {
  taskDescription: string; // What the agent should do
  repoPath: string; // Absolute path to the git repo
  baseBranch: string; // Default: "main"
  model: string; // Default: "claude-sonnet-4-6"
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

## Quality Gates

All gates must pass for a non-draft PR. Failure at any gate produces a draft PR.

1. **Verification** — `pnpm turbo lint typecheck test --filter=...[HEAD~1]` (lockfile auto-synced)
2. **Static analysis** — Regex-based diff scan for error-severity violations (milliseconds, no AI)
3. **LLM evaluation** — Haiku judges whether the diff addresses the task (skipped for <50-line diffs with passing tests, dep bumps, or test-only changes)
4. **Security review** — AI scans diff for hardcoded secrets, XSS, SQLi, a11y issues

## Tool Permissions

Agents run in `permissionMode: "acceptEdits"` with a `canUseTool` handler.

**Blocked tools:** `WebSearch`, `WebFetch`, `AskUserQuestion`, `EnterPlanMode`, `EnterWorktree`

**Blocked bash patterns:** `rm -rf /`, `sudo`, `curl|bash`, `git push`, `npm/pnpm publish`

**Encoding bypass protection:** Blocks base64-decode-to-shell, hex/octal printf-to-shell, eval of variable expansion, generic pipe-to-shell (`| sh`, `| bash`)

**File path restriction:** Write/Edit operations are denied outside the worktree path (prevents path traversal).

## Model Routing

`routeModel(issue)` selects tier based on issue metadata (first match wins):

| Tier   | When                                                                                                                  | Model             |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ----------------- |
| haiku  | `chore(deps):` or `fix(security):` title patterns                                                                     | claude-haiku-4-5  |
| sonnet | `ci-fix` label, simple features, default                                                                              | claude-sonnet-4-6 |
| opus   | `feature` label + complexity keywords (architect, refactor, migration, breaking change, schema change, multi-service) | claude-opus-4-6   |

## Multi-CLI Adapters

Supports dispatching agent tasks to Claude Code (SDK), Gemini CLI, or OpenCode CLI via a unified `AgentAdapter` interface.

### Architecture

```
AdapterConfig (task + worktree + model)
  → FailoverRouter (priority-cascade)
    → RateLimitDetector (per-adapter cooldown tracking)
    → Try adapters in order: claude → gemini → opencode
    → Skip if rate-limited or CLI not installed
    → Return RoutedAdapterResult (includes adapter attribution)
```

### Adapters

| Adapter            | Backend          | CLI binary | Key behavior                               |
| ------------------ | ---------------- | ---------- | ------------------------------------------ |
| `ClaudeAdapter`    | Claude Agent SDK | `claude`   | Native SDK integration via `runSession()`  |
| `GeminiCliAdapter` | Gemini CLI       | `gemini`   | Subprocess: `gemini run --non-interactive` |
| `OpenCodeAdapter`  | OpenCode CLI     | `opencode` | Subprocess: `opencode run --json`          |

### Key Modules

| Module                         | Responsibility                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `cli-adapter.ts`               | `AgentAdapter` interface, `AdapterConfig`, `AdapterResult` types               |
| `adapters/claude-adapter.ts`   | Wraps `runSession()` as an adapter                                             |
| `adapters/gemini-adapter.ts`   | Subprocess dispatch to Gemini CLI                                              |
| `adapters/opencode-adapter.ts` | Subprocess dispatch to OpenCode CLI                                            |
| `rate-limit-detector.ts`       | Tracks consecutive failures and cooldown expiry per adapter                    |
| `failover-router.ts`           | Priority-cascade dispatch, throws `AllAdaptersUnavailableError` when exhausted |

### Usage via CLI

```bash
mbe agent run "task" --adapter auto      # Failover: claude → gemini → opencode
mbe agent run "task" --adapter gemini    # Direct dispatch to Gemini CLI
mbe agent run "task" --adapter opencode  # Direct dispatch to OpenCode CLI
mbe agent run "task" --adapter claude    # Default — uses Claude SDK directly
```

## Stuck Detection

`createStuckDetector()` ingests SDK messages and returns `StuckPattern | null`.

| Pattern                       | Default Threshold                                       | Severity |
| ----------------------------- | ------------------------------------------------------- | -------- |
| `repeated_action_observation` | 4 identical action+observation pairs                    | error    |
| `repeated_error`              | 3 same-action errors in a row                           | error    |
| `self_message_loop`           | 3 identical text messages                               | error    |
| `alternating_pairs`           | 3 A-B-A-B cycles                                        | error    |
| `context_window_loop`         | 5 compactions                                           | error    |
| `context_window_warning`      | 2 compactions                                           | warning  |
| `zero_progress`               | 5 turns with no tool use                                | error    |
| `silent_failure_loop`         | 3 turns with successful tools but no file modifications | warning  |

Observations are normalized (PIDs, timestamps, hex addresses stripped) to avoid false negatives.

## Feedback Loop

After PR creation, if `feedbackLoop.enabled`:

1. Wait `pollIntervalMs` (default 30s), then poll for review comments + CI failures
2. Build a fix prompt from the feedback context
3. Run a new Claude session in the same branch to address feedback
4. Commit and push fixes
5. Repeat up to `maxRetries` (default 2) times
6. Budget: uses remaining session budget (not a fixed ratio)

## Orchestration

`runOrchestrator(config)` is a meta-agent that never edits code directly. It uses MCP tools (`create_session`, `check_session`, `list_sessions`, `cancel_session`) to manage child sessions via the Session API.

- Decomposes tasks into independent sub-tasks (different files/modules/layers)
- Respects `maxConcurrentSessions` (default 3)
- Monitors child session status until all reach terminal state
- Reports `succeeded | partially_succeeded | failed`
- Prompt injection protection: user task wrapped in `<task>` XML tags with anti-injection instructions

## Testing Patterns

Tests use vitest. Key mocking patterns:

```typescript
// Mock the Claude Agent SDK
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(() => mockAsyncIterable(messages)),
}));

// Mock child_process for git/gh commands
vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd, args, opts, cb) => cb(null, { stdout: "", stderr: "" })),
}));

// Test stuck detector by feeding sequences of SDK messages
const detector = createStuckDetector({ repeatedActionThreshold: 3 });
const result = detector.ingest(buildAssistantMessage(toolUse));
```

Run tests: `pnpm test` (or `pnpm test:watch` during development).

## Environment Variables

| Variable                      | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| `ANTHROPIC_API_KEY`           | Required — Claude API authentication                     |
| `GITHUB_TOKEN` / `GH_TOKEN`   | Required — PR creation and feedback polling via `gh` CLI |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional — OpenTelemetry collector for session traces    |
