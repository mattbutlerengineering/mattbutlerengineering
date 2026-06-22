# AI Security Threat Model

LLM-specific threat model for the agent surfaces in this monorepo. Covers the surfaces
exposed by the autonomous coding pipeline, the threat categories relevant to each, existing
mitigations that are actually in code, and recommended improvements not yet built.

> **Companion documents:**
> `docs/SECURITY-AI.md` — hard policy guardrails (cannot be overridden by agents).
> `docs/security/ai-prompt-injection.md` — deep-dive on prompt injection with OWASP / CWE mappings.

---

## Surfaces

### 1. `runSession()` in `packages/agent-core/src/session-runner.ts`

The primary entry point for all autonomous code execution. Accepts a `SessionConfig`
(task description, model, `maxTurns`, `maxBudgetUsd`, allowed tools) and drives a full
pipeline: worktree creation → Claude SDK query → verification gates → PR creation →
feedback loop.

**Relevant security properties:**

- Runs in an isolated git worktree provisioned by `worktree-manager.ts`. The worktree has
  no access to production infrastructure credentials beyond what was in the local shell at
  session start.
- Tool permissions are enforced by `createToolPermissionHandler()` in
  `packages/agent-core/src/tool-permissions.ts`. Write/Edit calls outside the worktree
  path are denied (path-traversal prevention). Bash commands are matched against
  `BLOCKED_BASH_PATTERNS` and `ENCODING_BYPASS_PATTERNS` in `gen-permissions.ts`.
- `maxTurns` (default 50) and `maxBudgetUsd` (default $1.00) are enforced as hard caps;
  the session terminates regardless of what the model requests.
- A stuck-detector in `stuck-detector.ts` terminates sessions that enter loops (repeated
  action+observation pairs, repeated errors, self-message loops, zero-progress streaks).
- Every session is traced to Langfuse via `startActiveObservation()` — cost, turns,
  stuck pattern, model, and task description are logged for audit.
- Failure records are written to `.agent-memory/failures.json` via `failure-memory.ts`
  for future session context.

### 2. Webhook handler — `services/agent/src/lib/verified-webhook.ts`

Receives external events (GitHub webhooks at `/v1/webhooks/github`, monitoring alerts at
`/v1/webhooks/remediation`). Both routes are protected by the same HMAC verification
middleware.

**Relevant security properties:**

- `createRawBodyCaptureHook()` captures the raw request bytes in `preParsing` before JSON
  parsing, preventing HMAC bypass via body-transform desync.
- `createVerifiedBodyPreHandler()` computes `HMAC-SHA256` over the raw body and compares
  with `timingSafeEqual` (constant-time, no timing-oracle). A missing or invalid signature
  returns `401` before any application logic runs.
- When the webhook secret env var is absent, the handler rejects with `401 Webhook secret
not configured` — fail-closed posture rather than open.
- Secrets are read from environment variables (`GITHUB_WEBHOOK_SECRET`,
  `REMEDIATION_WEBHOOK_SECRET`); neither is committed to the repository.

### 3. Remediation routes — `services/agent/src/routes/remediation.ts`

Receives monitoring alerts (Grafana, PagerDuty, custom) and triggers autonomous
investigation agent sessions. The alert payload is parsed and assembled verbatim into a
task description that is passed to `runSession()`.

**Relevant security properties:**

- HMAC verification (via `verified-webhook.ts`) gates the entire route — unauthenticated
  requests are rejected before parsing.
- `AlertPayloadSchema` (Zod) validates the payload at the boundary: `source` is an
  enum (`grafana | pagerduty | custom`), `alertName` is capped at 200 characters,
  `summary` is capped at 2000 characters, `severity` is an enum, and `generatorURL` must
  be a valid URL. Unknown fields are stripped.
- Rate-limited to 5 requests per minute (`config: { rateLimit: { max: 5, timeWindow:
"1 minute" } }`), preventing alert storms from spawning unbounded sessions.
- A circuit breaker (`checkCircuitBreaker()` in `remediation-circuit-breaker.ts`)
  suspends new sessions when the error rate crosses a threshold, returning `503`.
- `MAX_CONCURRENT_SESSIONS` (default 5) bounds total resource consumption at the service
  level.
- `info`-severity alerts are logged but produce no agent session (no-op return with
  `sessionId: ""`).

### 4. OMEGA memory — persistent cross-session state

OMEGA memory (referenced throughout `CLAUDE.md`) is a cross-session key-value store that
agents read and write via `omega_store()`, `omega_query()`, and `omega_profile()`. The
OMEGA MCP server is declared in `.mcp.json` under `root-signals`.

**Relevant security properties:**

- Entries are stored externally (Root Signals cloud), scoped to the project. The
  `ROOT_SIGNALS_API_KEY` env var authenticates writes; without it, the server is not
  loaded.
- Memory entries are plain text with no schema validation — any agent (or injected
  instruction) that calls `omega_store()` can persist arbitrary content that future
  agents will read as ground-truth context.
- No content sanitization or length cap exists on stored entries at the application level
  (the platform may enforce limits, but this repo does not enforce them locally).
- There is no ACL distinguishing what types of entries human versus agent sessions may
  write. An agent that successfully calls `omega_store()` with a crafted value can
  influence all future sessions that call `omega_query()`.

### 5. MCP tool access — external services

The agent runtime grants access to external services via MCP servers declared in
`.mcp.json`. Active servers include:

| MCP server     | Binary / source                            | External service accessed               |
| -------------- | ------------------------------------------ | --------------------------------------- |
| `semgrep`      | `npx @semgrep/mcp`                         | Semgrep cloud API                       |
| `mbe-infra`    | `npx tsx packages/mcp-server/src/index.ts` | Internal infra (in-process)             |
| `langfuse`     | `npx mcp-server-langfuse`                  | Langfuse Cloud (traces, prompts)        |
| `root-signals` | `uvx root-signals-mcp` (from GitHub)       | Root Signals cloud (OMEGA memory)       |
| `github`       | `npx @modelcontextprotocol/server-github`  | GitHub API (issues, PRs, repos)         |
| `sentry`       | `npx @sentry/mcp-server@latest`            | Sentry (error events, project data)     |
| `playwright`   | `npx @playwright/mcp@latest`               | Browser automation (live site crawling) |

**Relevant security properties:**

- MCP servers run in-process or as local subprocesses; they are not remote servers (except
  for the cloud APIs they proxy). Compromising a server requires compromising the local
  process or the upstream npm package.
- Three MCP servers pull packages from GitHub / npm at runtime (`root-signals`, `sentry`,
  `semgrep`). A compromised package version or a `npx` cache poisoning attack could inject
  malicious tool responses.
- The `playwright` server gives agents live browser access to arbitrary URLs. A page the
  agent navigates to can attempt to inject instructions via DOM content.
- The `github` MCP server authenticates via `GITHUB_PERSONAL_ACCESS_TOKEN`. A leaked
  token grants read/write access to all repositories the token can reach.
- The orchestrator in `packages/agent-core/src/orchestrator.ts` uses an in-process MCP
  server (`createSdkMcpServer()`) with an explicit allowlist of four tools
  (`create_session`, `check_session`, `list_sessions`, `cancel_session`). External MCP
  servers listed in `.mcp.json` are accessible to interactive (human-driven) Claude Code
  sessions, not restricted to the orchestrator allowlist.

### 6. PreToolUse hooks — `.claude/hooks/`

Claude Code's `PreToolUse` hooks run before every tool call in interactive sessions.
Current hooks relevant to security:

| Hook file                      | What it does                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `gsd-prompt-guard.js`          | Scans `Write`/`Edit` calls targeting `.planning/` files for 12 injection patterns and invisible Unicode. Advisory only — does not block. |
| `gsd-workflow-guard.js`        | GSD workflow enforcement.                                                                                                                |
| `regen-dep-graph.sh`           | Re-generates dependency graph when `package.json` changes (PostToolUse).                                                                 |
| `regen-after-update-branch.sh` | Re-runs `pnpm regen` after `gh pr update-branch` to prevent artifact drift (PostToolUse).                                                |
| `session-logger.sh`            | Writes session metadata (commits, files changed) to `.claude/session-logs/` on Stop (PostToolUse).                                       |

**Note:** `gsd-prompt-guard.js` is the only hook that scans content for injection patterns.
Its scope is limited to `.planning/` files. It is advisory — detection generates a warning
but does not block the write. There is no equivalent hook for session task descriptions,
issue bodies, or webhook payloads.

---

## Threat Categories

### 1. Prompt Injection

**Description:** An adversary embeds instructions in a data source the agent ingests —
GitHub issue bodies, PR descriptions, webhook payloads, MCP tool outputs, or web pages
fetched by Playwright — causing the agent to execute unauthorized actions.

**Affected surfaces:** `runSession()` (issue body is the task description), remediation
routes (alert summary is concatenated into the task prompt), orchestrator (MCP tool return
values reach the prompt), Playwright MCP (fetched DOM content).

**Existing mitigations:**

- HMAC-SHA256 webhook signature verification (`verified-webhook.ts`) prevents forged
  payloads from reaching the task prompt — the highest-risk injection vector for
  unauthenticated callers.
- `AlertPayloadSchema` (Zod) caps `summary` at 2000 chars and strips unknown fields,
  limiting the blast radius of a crafted alert payload.
- The orchestrator wraps user task descriptions in `<task>` XML tags with anti-injection
  instructions in the system prompt (see `task-decomposer.ts`).
- `gsd-prompt-guard.js` detects 12 injection-pattern regexes in `.planning/` writes
  (advisory).
- `docs/SECURITY-AI.md` (the system-prompt floor) instructs agents never to read `.env`
  files or log credential values, limiting what an injected instruction can exfiltrate.

**Absent mitigations:**

- No pre-processing strip of injection-pattern phrases from GitHub issue bodies before
  they are passed to `runSession()`.
- Prompt guard only covers `.planning/` writes; issue bodies, webhook summaries, and MCP
  tool outputs are not scanned.
- No structural sandboxing of the agent prompt (XML tag wrapping exists only in the
  orchestrator, not in `runSession()` directly).

**See also:** `docs/security/ai-prompt-injection.md` for full OWASP/CWE mapping and
detailed attack scenarios.

---

### 2. Credential Compromise

**Description:** An agent accesses secrets it should not see, or leaks secrets in PR
bodies, commit messages, code output, or log events.

**Affected surfaces:** `runSession()` (reads repo files; generates code committed to PRs),
session event stream (SSE), OMEGA memory (persists agent observations cross-session),
`diff-reviewer.ts` (AI reviews the diff and may surface secrets in its response).

**Existing mitigations:**

- `docs/SECURITY-AI.md` (system-prompt floor) explicitly prohibits reading `.env*`,
  `*.pem`, `*.key`, files named `secret/credential/token/password`, and several auth
  config files (`~/.npmrc`, `~/.aws/credentials`, etc.).
- Gitleaks CI scan (`.github/workflows/secret-scan.yml`) scans every PR diff for
  high-entropy strings and known secret patterns with `--redact` so the scan output does
  not itself contain the secret.
- Semgrep rule `avoid-logging-secrets` catches `console.log(..., $SECRET, ...)` patterns
  in generated code.
- Semgrep rule `avoid-hardcoded-secrets` flags string literals matching known secret
  formats.
- `sanitize-output.ts` HTML-escapes AI-generated stream chunks before they reach browser
  clients (XSS / output-injection mitigation).
- `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` are loaded from environment variables, not
  committed to the repo. Their names appear in `AGENTS.md` / `CLAUDE.md` documentation
  but their values are never logged.

**Absent mitigations:**

- There is no runtime check that prevents an agent from reading arbitrary repo files
  beyond the system-prompt prohibition. A sufficiently determined injection could instruct
  the agent to `cat` a secrets file and include it in a commit message or PR body.
- OMEGA memory entries are not scanned for credentials before they are stored.
- Agent session events written to `.claude/session-logs/` (by `session-logger.sh`) are
  not scanned for credentials before writing.

---

### 3. Resource Exhaustion

**Description:** An agent session consumes unbounded tokens, API budget, time, or
concurrent slots — either through a runaway prompt, a crafted injection ("iterate forever
until perfect"), or a misconfigured budget cap.

**Affected surfaces:** `runSession()`, remediation routes (alert storm → many sessions),
orchestrator (spawns parallel child sessions), feedback loop (recursive fix sessions).

**Existing mitigations:**

- `maxTurns` (default 50, configurable) is enforced as a hard cap in the session runner;
  the SDK terminates the session regardless of model output.
- `maxBudgetUsd` (default $1.00) triggers `budget_exceeded` termination in `types.ts`.
- `MAX_CONCURRENT_SESSIONS` (default 5) is enforced in the agent service, capping total
  parallel resource consumption.
- The remediation route is rate-limited to 5 requests per minute and gated by a circuit
  breaker (`checkCircuitBreaker()`) that trips open on repeated failures, returning `503`.
- The stuck-detector terminates sessions that loop without progress (repeated
  action+observation pairs, `zero_progress` after 5 turns with no tool use, etc.).
- The orchestrator respects `maxConcurrentSessions` (default 3) when spawning child
  sessions.
- The feedback loop caps retries at `maxRetries` (default 2) and uses the remaining
  session budget rather than a fresh allocation.

**Absent mitigations:**

- `maxBudgetUsd` and `maxTurns` are set per-session at call time with no server-side
  maximum. A caller with service access can set `maxBudgetUsd: 999` and `maxTurns: 9999`.
- There is no daily or monthly budget cap aggregated across all sessions. Resource
  consumption is visible in Langfuse but not enforced programmatically.
- The orchestrator's `maxConcurrentSessions` is a soft default; a crafted orchestrator
  prompt could attempt to spawn more sub-sessions than the configured limit if the tool
  call succeeds before the check runs.

---

### 4. Agent Drift

**Description:** An agent makes changes beyond its stated task scope — modifying unrelated
files, adding speculative features, bypassing security checks, or editing guardrail
documents.

**Affected surfaces:** `runSession()` (generates arbitrary file changes in the worktree),
diff-reviewer AI gate, PR auto-merge path.

**Existing mitigations:**

- `tool-permissions.ts` restricts Write/Edit tool calls to paths inside the worktree via
  path-traversal check (`isPathWithinWorktree()`), preventing the agent from modifying
  files outside its isolated branch.
- `docs/SECURITY-AI.md` classifies high-risk paths (`CLAUDE.md`, `.github/workflows/`,
  `prisma/migrations/`, `scripts/check-*.js`) as requiring user approval or specialist
  review before modification. This is enforced via the system-prompt floor.
- The AI diff-reviewer (`diff-reviewer.ts`) is a separate Haiku agent that scans the diff
  for scope violations, hardcoded secrets, and other blocking issues. Flagged PRs are
  opened as drafts and blocked from auto-merge.
- The static diff analyzer (`diff-static-analyzer.ts`) catches error-severity violations
  via regex without LLM cost.
- The PR risk classifier (`pr-risk-classifier.ts`) flags high-risk PRs that are blocked
  from `dep-bump-merger.ts` fast-path auto-merge.
- ADR compliance check (`check-adr.js`, CI `adr-check.yml`) blocks PRs introducing
  prohibited architectural changes.
- Pre-commit hook runs `eslint --fix` + `check-adr` + `pack-changed`; `--no-verify` is
  explicitly forbidden in `docs/SECURITY-AI.md`.

**Absent mitigations:**

- The file-path restriction is enforced only for Write/Edit; a Bash `cp` or `mv` to a
  path outside the worktree is not blocked by `BLOCKED_BASH_PATTERNS` in `gen-permissions.ts`.
- There is no line-count or file-count cap on a single session's changes. An agent could
  produce a very large diff that overwhelms the diff-reviewer's `MAX_DIFF_LENGTH`
  (50,000 chars in `diff-reviewer.ts`), causing truncation and potentially missing scope
  violations in the tail of the diff.

---

### 5. Supply Chain

**Description:** A compromised npm dependency or MCP server binary injects malicious
behavior — either in tool responses (influencing the agent prompt) or in code that runs
during builds or tests.

**Affected surfaces:** MCP tool access (three servers pulled via `npx`/`uvx` at runtime),
`pnpm install` (package resolution from npm registry), CI build pipeline.

**Existing mitigations:**

- `pnpm-lock.yaml` pins exact package versions and content hashes, preventing silent
  version upgrades during installs. `pnpm install --frozen-lockfile` is the standard
  install command in CI and agent worker prompts.
- `pnpm.overrides` in `package.json` applies scoped CVE patches using the
  `"pkg@<vulnerable": "^patched"` pattern to avoid broad range over-resolution.
- Semgrep rules catch `eval`, unsafe dynamic `require`, and function-constructor patterns
  in generated code (`semgrep.yml`), limiting what a compromised dependency could
  introduce via codegen.
- The ADR compliance check (`check-deps`) blocks PRs that introduce dependency
  relationships violating architectural constraints.
- Gitleaks scans PR diffs — if a compromised package causes an agent to commit a secret,
  Gitleaks catches it before merge.
- The Semgrep MCP server (`.mcp.json`) is used for scanning, not code execution; its
  output is advisory.

**Absent mitigations:**

- Three MCP servers are fetched at runtime without a version pin:
  `@sentry/mcp-server@latest`, `@playwright/mcp@latest`, and the `root-signals` package
  pulled directly from GitHub (`git+https://github.com/root-signals/root-signals-mcp`).
  A compromised publish or GitHub push to any of these could inject malicious tool
  responses into an active agent session without changing `pnpm-lock.yaml`.
- There is no integrity check on MCP server binaries after download. `npx` pulls and
  executes without an `--integrity` hash.
- No software bill of materials (SBOM) is generated or attested in CI.

---

### 6. Agent-to-Agent Injection

**Description:** One agent's output (a PR body, a session event, a failure record, or an
OMEGA memory entry) is consumed unsanitized by another agent's prompt, allowing the first
agent's output to inject instructions into the second agent's behavior.

**Affected surfaces:** OMEGA memory (one session writes, a future session reads as ground
truth), `failure-memory.ts` (stores `taskDescription` and `approach` from failed sessions
and re-injects them into future session prompts), feedback loop (PR review comments from
one agent trigger a fix session that reads those comments), orchestrator (child session
status messages are returned as tool output and reach the orchestrator's context window).

**Existing mitigations:**

- The orchestrator wraps the user task description in `<task>` XML tags with explicit
  anti-injection instructions in its system prompt (`task-decomposer.ts`), providing
  structural separation between instructions and data.
- HMAC verification on webhook payloads prevents external actors from injecting content
  via the remediation or GitHub webhook routes.
- `failure-memory.ts` limits stored records to the most recent 100, preventing unbounded
  growth of the failure context injected into future prompts.
- The feedback loop and diff-reviewer are separate agent invocations with their own
  budgets and turn limits, containing the blast radius of a compromised review response.

**Absent mitigations:**

- OMEGA memory entries are stored as plain text with no sanitization or content policy
  enforcement. A session that is itself manipulated by prompt injection can store
  adversarial content in OMEGA that poisons all future sessions that query it.
- `failure-memory.ts` stores the raw `taskDescription` from failed sessions and includes
  it in future session prompts without escaping or stripping injection patterns. A
  crafted task description that causes a session to fail could persist its injected
  content in the failure store.
- PR review comments that trigger feedback-loop fix sessions are read verbatim. A
  malicious reviewer (or a compromised reviewer agent) could craft a review comment
  designed to manipulate the fix session.
- Session event logs written by `session-logger.sh` include raw git commit messages and
  file paths, which are not sanitized before being logged.

---

## Improvement Recommendations

The following improvements are not yet implemented. Each is actionable as a follow-up
issue.

### Recommendation A: Pin MCP server versions and verify integrity

**Category:** Supply Chain (Threat 5)

Three MCP servers in `.mcp.json` are fetched at runtime without version pins
(`@sentry/mcp-server@latest`, `@playwright/mcp@latest`) or without npm version pinning at
all (`root-signals` is fetched directly from GitHub). A publish to these packages could
inject malicious tool responses into an active agent session.

**Recommended change:** Pin all three to explicit semver versions in `.mcp.json`. Add a
lockfile or integrity-hash mechanism for MCP binaries (e.g., `npx --integrity sha512-...`
or vendoring the packages into the monorepo). Set a reminder or Renovate rule to review
and bump pins periodically.

---

### Recommendation B: Sanitize agent-facing data sources before prompt injection

**Category:** Prompt Injection (Threat 1), Agent-to-Agent Injection (Threat 6)

Issue bodies passed to `runSession()`, failure records re-injected from
`failure-memory.ts`, and OMEGA memory entries read at session start are all consumed by
the agent prompt without any sanitization. The prompt guard in `gsd-prompt-guard.js`
only covers `.planning/` writes.

**Recommended change:** Add an `sanitizeAgentInput(text: string): string` function in
`packages/agent-core/src/` that strips or flags known injection-pattern phrases (the 12
patterns already in `gsd-prompt-guard.js` are a starting point). Apply it to:

1. `taskDescription` before it enters the system prompt in `prompt-builder.ts`.
2. Failure record `taskDescription` and `approach` before re-injection in
   `failure-memory.ts`.
3. OMEGA memory values before they are surfaced to agent sessions.

---

### Recommendation C: Enforce a server-side budget ceiling and session aggregate cap

**Category:** Resource Exhaustion (Threat 3)

`maxBudgetUsd` and `maxTurns` are accepted at call time with no enforced upper bound.
There is no aggregate daily or monthly spend cap across sessions.

**Recommended change:** Add a server-side maximum to the agent service session-creation
route: reject requests where `maxBudgetUsd > MAX_ALLOWED_BUDGET_USD` or
`maxTurns > MAX_ALLOWED_TURNS` (configurable env vars with conservative defaults, e.g.
$5.00 and 200 turns). Add a spend-aggregation check in `cost-tracker.ts` / `cost-logger.ts`
that queries total spend in a rolling 24-hour window and trips the circuit breaker when a
configurable ceiling is reached.

---

### Recommendation D: Validate OMEGA memory content before trust injection

**Category:** Agent-to-Agent Injection (Threat 6)

OMEGA memory entries are read back as authoritative context for future agents. A
compromised session can write adversarial content that persists across all future sessions.

**Recommended change:** Introduce a content-policy check on `omega_query()` results
before they are surfaced to the agent — apply the same 12 injection-pattern regexes used
in `gsd-prompt-guard.js` and log (or suppress) any matching entries. Consider adding a
freshness window: distrust entries older than a configurable age when they originate from
agent-written (rather than human-confirmed) records.

---

## Cross-references

- `docs/SECURITY-AI.md` — hard guardrail policy (system-prompt floor for all agents)
- `docs/security/ai-prompt-injection.md` — deep-dive: attack scenarios, OWASP LLM Top 10
  mapping, CWE mappings, defense-layer summary
- `packages/agent-core/src/tool-permissions.ts` — runtime tool permission handler
- `packages/agent-core/src/gen-permissions.ts` — blocked bash patterns and encoding bypass
  patterns
- `services/agent/src/lib/verified-webhook.ts` — HMAC webhook verification
- `services/agent/src/routes/remediation.ts` — remediation webhook route with circuit
  breaker and rate limiting
- `.claude/hooks/gsd-prompt-guard.js` — PreToolUse injection pattern scanner
- `.mcp.json` — MCP server configuration (tool access surface)
- `.github/workflows/secret-scan.yml` — Gitleaks CI secret scanning
- `semgrep.yml` — static analysis rules with CWE metadata
- `SECURITY.md` — public vulnerability reporting policy
