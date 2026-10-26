# @mbe/agent-core

Autonomous coding agent runtime. Manages the full lifecycle: worktree creation, Claude SDK session, quality gates, PR creation, and feedback loops.

## Reference

Session pipeline, module map, `SessionConfig` and multi-CLI adapters: [docs/reference.md](./docs/reference.md).

## Quality Gates

All gates must pass for a non-draft PR. Failure at any gate produces a draft PR.

1. **Verification** — `pnpm turbo lint typecheck test --filter=...[HEAD~1]` (lockfile auto-synced)
2. **Static analysis** — Regex-based diff scan for error-severity violations (milliseconds, no AI)
3. **LLM evaluation** — Haiku judges whether the diff addresses the task (skipped for <50-line diffs with passing tests, dep bumps, or test-only changes)
4. **Security review** — AI scans diff for hardcoded secrets, XSS, SQLi, a11y issues

Gate implementation lives in `src/gates/` (individual gate modules) and `src/phases/` (pipeline phase orchestration). Key gate/phase modules:

| Module                          | Responsibility                                     |
| ------------------------------- | -------------------------------------------------- |
| `gate-runner.ts`                | Runs all gates in sequence; aggregates results     |
| `gates/llm-evaluation-gate.ts`  | LLM-as-judge gate implementation                   |
| `gates/security-review-gate.ts` | AI security review gate implementation             |
| `gates/static-analysis-gate.ts` | Fast regex static analysis gate implementation     |
| `phases/verification-phase.ts`  | Turborepo lint/typecheck/test verification phase   |
| `phases/feedback-phase.ts`      | Post-merge CI polling and auto-fix phase           |
| `phases/publish-phase.ts`       | PR creation and publish phase                      |
| `phases/query-phase.ts`         | Claude SDK query phase with stuck detection        |
| `phases/worktree-phase.ts`      | Worktree lifecycle (create, commit, push, cleanup) |

## Tool Permissions

Agents run in `permissionMode: "acceptEdits"` with a `canUseTool` handler.

**Blocked tools:** `WebSearch`, `WebFetch`, `AskUserQuestion`, `EnterPlanMode`, `EnterWorktree`

**Blocked bash patterns:** `rm -rf /`, `sudo`, `curl|bash`, `git push`, `npm/pnpm publish`

**Encoding bypass protection:** Blocks base64-decode-to-shell, hex/octal printf-to-shell, eval of variable expansion, generic pipe-to-shell (`| sh`, `| bash`)

**File path restriction:** Write/Edit operations are denied outside the worktree path (prevents path traversal).

## Model Routing

`routeModel(issue, ctx?)` (`src/model-router.ts`) selects tier based on issue metadata and optional runtime context (first match wins):

| Tier   | When                                                                                                                                                                                               | Model                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| haiku  | Title matches `chore(deps):`, `chore(deps-*):`, `fix(security):`, `docs:`, `test:`, `chore(lint):`, or `chore(style):` — **or** the task's resolved source paths are all test/docs files, ≤2 paths | claude-haiku-4-5-20251001 |
| sonnet | `ci-fix` label; `feature` label with no complexity signal; default when nothing else matches                                                                                                       | claude-sonnet-5           |
| opus   | `feature` label + complexity keywords (architect, refactor, migration, breaking change, schema change, multi-service) — **or** `feature` label touching >15 source files                           | claude-opus-4-8           |

**Post-processing** (`applyContextAdjustments`, runs after the base tier above): a `haiku` result is escalated to `sonnet` if `ctx.pastFailureTier` shows a prior haiku attempt failed on a similar task; an `opus` result is downgraded to `sonnet` if `ctx.remainingBudgetUsd` is below $0.30.

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
- Reports `in_progress | partially_succeeded | succeeded | failed` after a single status pass over child sessions — `in_progress` (or `partially_succeeded` if any child already succeeded) when any child is still `running`/`pending`; `failed` only once all children are terminal and at least one is `failed`/`cancelled` with none succeeded
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
