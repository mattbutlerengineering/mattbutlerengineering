# ACMM Framework Gaps — What the Model Doesn't Measure

> **Context:** Issue #645 — analyze and document gaps in the current AI Codebase Maturity Model.
> The canonical ACMM (89 criteria, 6 levels, 4 sources) measures structural and procedural readiness well.
> This document identifies **what it does not measure** about real-world AI readiness.

## Summary

The ACMM framework excels at measuring **infrastructure for AI** (instructions, hooks, CI, metrics, autonomy loops). It has blind spots in **AI-specific operational readiness**, **cost governance**, **quality of AI output beyond acceptance rate**, and **resilience of the AI system itself**.

---

## Gap Categories

### 1. AI Tooling & Context Readiness

| Gap | Description | Why It Matters |
|---|---|---|
| **MCP / Tool Integration** | No criterion measures whether the AI has access to project-relevant tools (databases, internal APIs, deployment consoles) via Model Context Protocol or plugin systems. | An AI with only file system access cannot perform operational tasks like querying a production DB or checking a staging deploy. |
| **Semantic Code Understanding** | No criterion for LSP integration, code graph, or AST-aware navigation aids that help the AI understand the codebase beyond file text. | File-presence detection doesn't ensure the AI can navigate complex type hierarchies or dependency graphs efficiently. |
| **Context Window Efficiency** | No metric for how effectively the AI uses its context (compression strategies, summary quality, irrelevant context exclusion). | Wasted context degrades reasoning quality; the framework doesn't reward efficient context management. |
| **Onboarding Velocity** | No measure of time-to-first-meaningful-contribution for a new AI session. | A repo might have all the files (L4+) but still require 30+ minutes of exploration before the AI can make a useful change. |

**Suggested new metrics:**
- `acmm:mcp-server-config` — Detects `.claude/mcp.json` or equivalent MCP server configurations.
- `acmm:code-graph` — Detects LSP config, tags files, or code intelligence tooling.
- `acmm:onboarding-benchmark` — A script that times a fresh AI session completing a canned task.

---

### 2. Cost & Resource Governance

| Gap | Description | Why It Matters |
|---|---|---|
| **Token Usage Tracking** | No criterion measures token consumption, context window utilization, or cost-per-task tracking. | Without cost visibility, AI adoption can lead to unexpected bills; model tiering (L3) is mentioned but not tracked. |
| **Budget Controls** | No enforcement of spending limits, per-task budgets, or cost alerting. | Autonomous systems (L5/L6) can consume resources unbounded without human oversight. |
| **Compute Resource Awareness** | No measure of whether the AI considers CI minutes, build costs, or environmental impact of its actions. | High-frequency L6 loops can burn CI minutes or cloud credits rapidly. |

**Suggested new metrics:**
- `acmm:token-tracking` — A log or dashboard showing token usage per session/task.
- `acmm:budget-policy` — A config file defining per-task or per-day cost limits.

---

### 3. AI Output Quality Beyond Acceptance Rate

| Gap | Description | Why It Matters |
|---|---|---|
| **Explanation Quality** | No criterion measures whether the AI can explain *why* it made a change (commit message quality, PR description reasoning). | Acceptance rate measures outcome but not understanding; explanations help humans audit intent. |
| **Hallucination / Repetition Rate** | No metric for AI self-correction loops, repetition detection, or hallucination frequency. | Autonomous systems need internal quality signals beyond CI pass/fail. |
| **Feedback Actionability** | No measure of whether human corrections are specific and actionable vs. vague ("try again"). | The framework captures corrections (L2/L3) but not whether those corrections improve future behavior. |
| **Benchmark Performance** | No criterion for running repo-specific benchmarks (e.g., "can the AI fix this seeded bug?") to measure capability growth. | Acceptance rate is binary; benchmarks show capability progression. |

**Suggested new metrics:**
- `acmm:explanation-standards` — A rubric for commit/PR message quality, enforced via hooks.
- `acmm:self-correction-metric` — Tracks revert/fix cycles per AI PR as a quality signal.
- `acmm:repo-bench` — A script that seeds known issues and measures AI success rate.

---

### 4. Security & Safety of AI Systems

| Gap | Description | Why It Matters |
|---|---|---|
| **Prompt Injection Defense** | No criterion for sandboxing AI inputs, validating external content before feeding to AI, or preventing prompt injection via issue/PR descriptions. | L5/L6 systems ingest untrusted text; injection can bypass governance. |
| **Secret Leakage Prevention in AI Outputs** | While pre-commit hooks catch secrets, no specific measure for AI-output scanning (e.g., does the AI accidentally expose keys in generated code?). | AI-generated code may introduce new secret patterns not caught by generic scanners. |
| **AI Agent Identity & Non-repudiation** | Audit trails (L4/L5) label PRs as "ai-generated" but no criterion for cryptographic signing, agent identity attestation, or audit log integrity. | In regulated environments, you need to prove which agent made which change. |
| **Adversarial Input Resilience** | No measure for how the AI system handles malformed instructions, conflicting rules, or adversarial "user" corrections. | L6 systems may be tricked by malicious issue descriptions. |

**Suggested new metrics:**
- `acmm:prompt-injection-sandbox` — A workflow that sanitizes external inputs before AI processing.
- `acmm:agent-attestation` — Agent-signed commits with verifiable identity.

---

### 5. Resilience & Disaster Recovery

| Gap | Description | Why It Matters |
|---|---|---|
| **AI Service Dependency** | No criterion for what happens when the AI service (Claude, etc.) is unavailable — fallback strategies, offline modes, or cached context. | L6 autonomous loops break completely if the AI API is down; no resilience measure exists. |
| **State Recovery** | No measure for recovering AI state (memory, task ledger, session context) after corruption or loss. | The framework assumes state files persist; no backup or recovery mechanism is measured. |
| **Rollback Automation for AI Mistakes** | Rollback drill (L6) is documented but no criterion for *automated* detection and rollback of bad AI changes. | L6 says "system acts"; it should also "system undoes" without human trigger. |

**Suggested new metrics:**
- `acmm:ai-service-fallback` — A config defining behavior when AI APIs are unreachable.
- `acmm:state-backup` — Automated backup of `.claude/` state, task ledgers, memory files.
- `acmm:auto-rollback` — A workflow that detects regressions from AI PRs and reverts automatically.

---

### 6. Human-AI Collaboration Quality

| Gap | Description | Why It Matters |
|---|---|---|
| **Pair Programming Effectiveness** | No criterion for how well humans and AI collaborate in real-time (session sharing, human-in-the-loop checkpoints, override frequency). | The framework optimizes for autonomy (L5/L6) but not for collaborative modes that many teams prefer. |
| **Override Explanation Quality** | No measure of why humans override AI suggestions — tracked as corrections but not categorized (safety, style, misunderstanding, etc.). | Understanding override reasons helps improve the system; the framework doesn't differentiate. |
| **Human Review Fatigue** | L5 anti-pattern mentions "alert fatigue" but no metric for review burden, click-through rate, or review quality degradation over time. | Autonomous systems can overwhelm human reviewers; no measure exists for sustainable review load. |

**Suggested new metrics:**
- `acmm:override-analytics` — Categorizes and trends human overrides to identify systemic issues.
- `acmm:review-burden` — Tracks review time per PR, reviewer count, and fatigue signals.

---

### 7. Compliance & Regulatory Readiness

| Gap | Description | Why It Matters |
|---|---|---|
| **AI Compliance Documentation** | No criterion for documenting AI system compliance with regulations (GDPR, FDA, SOC2) when AI touches sensitive code. | Regulated industries need to audit not just code but AI process compliance. |
| **Bias & Fairness in AI Output** | No measure for detecting bias in AI-generated UI/UX code, accessibility regressions, or fairness in algorithmic decisions. | AI can inadvertently introduce biased logic; the framework doesn't measure fairness. |
| **Data Residency & Privacy** | No criterion for ensuring AI processing respects data residency requirements (e.g., sending code to external AI services). | Some organizations cannot send certain code to cloud AI services; no measure exists for this constraint. |

**Suggested new metrics:**
- `acmm:ai-compliance-doc` — A document mapping AI workflows to regulatory requirements.
- `acmm:accessibility-ai-check` — AI-generated UI code is automatically checked for a11y regressions.

---

### 8. Cross-System Coordination

| Gap | Description | Why It Matters |
|---|---|---|
| **Multi-Repo AI Orchestration** | Cross-repo skill sharing (L4) exists, but no criterion for coordinating AI work across multiple repos in an org (e.g., an AI that updates a shared lib and all downstream consumers). | Real orgs have many repos; L6 autonomy in one repo doesn't help cross-repo changes. |
| **External System Integration** | No measure for AI ability to interact with external systems (Jira, Slack, PagerDuty) beyond GitHub. | Mature AI ops need to notify Slack, page on-call, or update external trackers. |
| **AI System Monitoring** | No criterion for monitoring the AI system itself (latency, error rates, timeout frequency) as distinct from CI health. | The framework measures code health but not AI agent health. |

**Suggested new metrics:**
- `acmm:multi-repo-orchestration` — A workflow that coordinates AI changes across dependent repos.
- `acmm:ai-health-dashboard` — Dashboard showing AI API latency, error rates, and timeout trends.

---

## Gaps Ranked by Impact for Real AI Readiness

| Priority | Gap Area | Impact | Difficulty to Add |
|---|---|---|---|
| P0 (Critical) | **AI Tooling & Context Readiness** | High — without tools, AI can't perform operational tasks | Medium |
| P0 (Critical) | **Cost & Resource Governance** | High — unbounded costs kill AI adoption | Low (config files) |
| P1 (High) | **AI Output Quality Beyond Acceptance** | High — acceptance rate alone doesn't ensure quality | Medium |
| P1 (High) | **Security & Safety of AI Systems** | High — L5/L6 systems are attack surfaces | High |
| P2 (Medium) | **Resilience & Disaster Recovery** | Medium — L6 breaks if AI service fails | Medium |
| P2 (Medium) | **Human-AI Collaboration Quality** | Medium — many teams want collaboration not full autonomy | Low |
| P3 (Nice-to-have) | **Compliance & Regulatory Readiness** | Low for most, High for regulated industries | High |
| P3 (Nice-to-have) | **Cross-System Coordination** | Low for single repo, High for enterprises | High |

---

## Recommendations

1. **Upstream these gaps** to [kubestellar/console](https://github.com/kubestellar/console) as candidate criteria for ACMM v2.
2. **For this repo**, consider adding local metrics in `plugins/acmm/scripts/sources/` as experimental extensions (without breaking upstream parity).
3. **Next steps**: Pick one P0 gap (e.g., cost governance) and implement a detection criterion + metric in a follow-up issue.

---

## References

- Canonical ACMM: [arXiv:2604.09388](https://arxiv.org/abs/2604.09388)
- Source code: `plugins/acmm/scripts/sources/`
- Related issues: #646 (flake-rate), #647 (PR outcomes), #648 (cold-start)
- This document: `docs/acmm/gaps.md`
