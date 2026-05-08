# AI Compliance Documentation

Maps AI agent workflows to regulatory and compliance requirements. Covers data access boundaries, audit trails, and risk controls.

## AI Data Access Map

### What AI agents CAN access

| Data Category   | Examples                                      | Access Method                                       |
| --------------- | --------------------------------------------- | --------------------------------------------------- |
| Source code     | All files in the monorepo                     | Direct file system read/write in sandboxed worktree |
| Git history     | Commits, branches, diffs, blame               | `git` CLI commands                                  |
| GitHub issues   | Titles, bodies, labels, comments              | `gh` CLI and GitHub MCP server                      |
| PR text         | Descriptions, review comments, check status   | `gh` CLI and GitHub MCP server                      |
| CI logs         | GitHub Actions workflow output                | `gh run view`                                       |
| Public docs     | Cloudflare Pages sites, npm registry metadata | Web fetch to allowlisted domains                    |
| Langfuse traces | Session metrics, prompt templates             | Langfuse MCP server (read-only)                     |

### What AI agents CANNOT access

| Data Category           | Enforcement Mechanism                                                                |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Production databases    | No database credentials in agent environment; `SECURITY-AI.md` hard prohibition      |
| User PII                | No production data loaded into agent context; agents only see code and metadata      |
| Secrets and credentials | `.env` files blocked by PreToolUse hook; Semgrep pre-commit scans for leaked secrets |
| Private keys            | `*.pem`, `*.key`, `id_rsa*` blocked by `SECURITY-AI.md` read prohibition             |
| Cloud provider consoles | Destructive operations (delete, destroy) require explicit user approval per call     |
| Other repos             | Agent runs in a single-repo worktree; no cross-repo file system access               |

## Regulatory Framework Mapping

### GDPR (Data Protection)

| GDPR Principle                          | How AI Workflows Comply                                                                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data minimization** (Art. 5(1)(c))    | Agents process source code and issue metadata only. No production user data is loaded into AI context. Task prompts reference issue numbers, not user records.              |
| **Purpose limitation** (Art. 5(1)(b))   | Each agent session has a defined task (fix bug, write test, audit compliance). The task description is logged in Langfuse traces and git commit messages.                   |
| **Storage limitation** (Art. 5(1)(e))   | Code sent to Anthropic's Claude API is not retained for training (per Anthropic's API data policy). Session traces in Langfuse follow the project's data retention policy.  |
| **Right to erasure** (Art. 17)          | No user PII enters the AI pipeline. If a GitHub issue inadvertently contains PII, it is in GitHub (the data controller's platform), not stored separately by the AI system. |
| **Data protection by design** (Art. 25) | Sandboxed worktrees, scoped credentials, and PreToolUse hooks enforce data boundaries at the architecture level, not just policy.                                           |

### SOC 2 (Trust Services Criteria)

| SOC 2 Category                   | How AI Workflows Comply                                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CC6.1 — Logical access**       | Agents use scoped GitHub tokens. `.claude/settings.json` defines allow/deny lists for tool access. PreToolUse hooks block access to `.env` files and sensitive paths.                                             |
| **CC6.3 — Access authorization** | `SECURITY-AI.md` defines hard prohibitions that cannot be overridden by any instruction file. Destructive operations require per-call user approval.                                                              |
| **CC7.2 — System monitoring**    | Langfuse traces record every agent session with model, cost, token usage, and success/failure metrics. GitHub labels track agent state (`in-progress`, `has-pr`, `agent-failed`).                                 |
| **CC8.1 — Change management**    | All agent changes go through git commits, PR reviews, and CI checks. Branch protection prevents direct pushes to main. Pre-commit hooks enforce linting, type checking, and security scanning.                    |
| **CC9.1 — Risk mitigation**      | Budget limits cap per-session cost. Semgrep pre-commit scanning catches security anti-patterns. Layered safety model (hooks + CI + permissions + credential scoping) ensures no single failure bypasses controls. |

### General Audit Requirements

| Audit Need              | Implementation                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Who made the change** | Git author + `Co-Authored-By: Claude` trailer on agent commits. Agent branches use `agent-*` prefix. GitHub labels distinguish agent-created PRs. |
| **When was it made**    | Git commit timestamps. Langfuse session start/end times. GitHub PR/issue event timeline.                                                          |
| **What was changed**    | Git diff on every commit. PR description summarizes intent. CI checks record pass/fail against the diff.                                          |
| **Why was it changed**  | GitHub issue body provides task intent. Langfuse trace records the task description. Commit messages follow Conventional Commits format.          |
| **Was it reviewed**     | PR review workflow. `has-pr` label indicates awaiting review. Branch protection requires CI pass before merge.                                    |

## AI Decision Audit Trail

Every AI agent action produces artifacts in at least three systems.

### 1. Git (permanent record)

- **Commits**: Conventional Commits format with scope, description, and optional body
- **Co-Authored-By trailer**: Identifies agent-authored commits
- **Branch naming**: `agent-*` or `worktree-agent-*` prefix for agent work

### 2. GitHub (coordination layer)

- **Issues**: Task intent recorded in issue body; labels track state machine (`ready` -> `in-progress` -> `has-pr`)
- **PRs**: Description summarizes changes; CI check results attached; review comments preserved
- **Labels**: `acmm`, `audit`, `ci-fix`, `agent-failed` classify the nature and outcome of agent work

### 3. Langfuse (AI observability)

- **Session traces**: One per `runSession()` call with task description, model, and budget metadata
- **Generation spans**: One per SDK turn with model, input/output, and token usage
- **Session metrics**: `success` (0/1), `cost_usd`, `num_turns`, `stuck` (0/1), `evaluation_confidence`

### Trace correlation

To trace a production change back to its AI origin:

1. Find the commit SHA in `git log`
2. Identify the PR via `gh pr list --search <SHA>`
3. Read the issue linked in the PR description for task intent
4. Search Langfuse traces by task description or time window for session details

## Data Residency

### Code processing

Source code is sent to Anthropic's Claude API (hosted in the US) for processing during agent sessions. This includes:

- File contents read by the agent
- Git diffs and command outputs
- GitHub issue and PR text

### What is NOT sent to external APIs

- Production database contents
- User PII or customer data
- Secret values (blocked at the tool level before they reach the API)
- Binary assets (images, compiled files)

### Anthropic data policy

Per Anthropic's API Terms of Service, API inputs and outputs are not used to train models. Customer data sent through the API is processed for the request and not retained beyond the session.

### Langfuse data

Session traces (metadata only — no source code) are stored in Langfuse Cloud (EU-hosted). Traces include task descriptions, model names, token counts, and cost metrics. They do not include file contents or code snippets.

## Risk Assessment

### Low risk (AI touches code and metadata only)

| Risk                          | Likelihood | Impact | Mitigation                                                              |
| ----------------------------- | ---------- | ------ | ----------------------------------------------------------------------- |
| Agent introduces a bug        | Medium     | Low    | CI tests, pre-commit hooks, PR review catch regressions before merge    |
| Agent writes inefficient code | Medium     | Low    | Code review (human or AI) and performance benchmarks                    |
| Agent misunderstands task     | Medium     | Low    | Task intent recorded in issue; PR diff is reviewable; revert is trivial |

### Medium risk (metadata may contain PII)

| Risk                                           | Likelihood | Impact | Mitigation                                                                                                    |
| ---------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| Issue text contains user PII in bug reports    | Low        | Medium | GitHub is the data controller; PII in issues is a GitHub data governance concern, not unique to AI processing |
| PR comments reference customer names           | Low        | Medium | Review process; Langfuse traces do not store PR comment text                                                  |
| Agent reads stale credentials in code comments | Very low   | Medium | Semgrep pre-commit hook scans for hardcoded secrets; PreToolUse hook blocks `.env` reads                      |

### Residual risks

| Risk                                         | Status                                                          | Owner               |
| -------------------------------------------- | --------------------------------------------------------------- | ------------------- |
| Prompt injection via GitHub issue body       | Documented in `docs/security/ai-prompt-injection.md`            | Engineering         |
| Agent identity spoofing (no GPG signing yet) | Documented in `docs/acmm/agent-attestation.md`, Phase 3 roadmap | Engineering         |
| Langfuse trace data retention exceeds policy | Review annually                                                 | Engineering + Legal |

## Controls Summary

| Control                 | Type           | Enforcement                                                                                   |
| ----------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| **Sandboxed worktrees** | Preventive     | Each agent session runs in an isolated git worktree; no shared state with other sessions      |
| **Scoped credentials**  | Preventive     | Agents use repository-scoped GitHub tokens; no cloud provider admin access                    |
| **PreToolUse hooks**    | Preventive     | Block reads of `.env`, secrets files; block writes to protected paths                         |
| **Pre-commit scanning** | Detective      | Semgrep runs on every commit; blocks secrets, injection patterns, and security anti-patterns  |
| **Budget limits**       | Preventive     | Per-session cost cap (`--max-budget`) prevents unbounded token spend                          |
| **CI pipeline**         | Detective      | Lint, typecheck, test, and security checks run on every PR                                    |
| **SECURITY-AI.md**      | Policy         | Hard prohibitions that no instruction file can override                                       |
| **Langfuse tracing**    | Detective      | Every session traced with model, cost, and outcome metrics                                    |
| **Branch protection**   | Preventive     | Direct push to main blocked; CI must pass before merge                                        |
| **GitHub labels**       | Administrative | State machine labels (`in-progress`, `has-pr`, `agent-failed`) provide operational visibility |

## Review Schedule

This document should be reviewed:

- **Quarterly**: Verify controls are still enforced and no new data flows bypass them
- **On regulatory change**: Update framework mappings when new requirements apply
- **On architecture change**: Update data access map when new MCP servers, APIs, or data stores are added
- **On incident**: Update risk assessment if an AI-related security or compliance event occurs
