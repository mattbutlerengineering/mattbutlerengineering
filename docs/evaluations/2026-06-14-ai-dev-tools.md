# AI Tools for Software Development Evaluation — June 2026

> Snapshot of the AI development-tooling landscape, grounded in a `/last30days` community pull (Reddit + Hacker News + GitHub, 58 items) plus web supplements, then mapped against what this monorepo already uses. The social signal in the window skewed toward AI-adoption _discourse_ (skepticism, security, "slop"); the tool rankings come mostly from the web supplements. Sorted by signal quality, not raw mention count.

## Current State (what this repo uses)

| Layer                          | Tools in use                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| **Editors / agents**           | Claude Code (primary), Cursor (contributors)                                         |
| **In-house agent runtime**     | `@mbe/agent-core` (`mbe agent run/orchestrate`), `@anthropic-ai/claude-agent-sdk`    |
| **Model SDK**                  | Vercel AI SDK (`ai`) + `@ai-sdk/anthropic`, `@anthropic-ai/sdk`                      |
| **MCP servers** (`.mcp.json`)  | github, langfuse, mbe-infra, root-signals, semgrep, sentry                           |
| **Claude Code plugins/skills** | claude-mem (memory), graphify (knowledge graph), context7 (docs), Playwright, Prisma |
| **Observability**              | Langfuse (LLM tracing), Sentry                                                       |
| **Security scanning**          | Semgrep (CLI + MCP)                                                                  |
| **Autonomous loop**            | `/implement-queue`, site-audit, ci-monitor, learning-loop, RemoteTriggers            |

## Landscape (last 30 days)

The market split into distinct layers; effective teams mix 2-3 tools rather than standardizing on one.

### 1. Editors / IDEs (inline + multi-file)

| Tool                              | Note                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| **Cursor**                        | Developer favorite for daily IDE flow; multi-file context.   |
| **GitHub Copilot**                | Leads enterprise adoption; best-value inline autocomplete.   |
| **Windsurf**                      | Wave 13 added multi-agent sessions, git worktrees, SWE-grep. |
| **Zed**, **JetBrains AI / Junie** | Editor-native AI, growing.                                   |

### 2. Terminal / agentic coders

| Tool            | Note                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| **Claude Code** | Strongest reasoning for complex/multi-step tasks; Opus 4.8 ~78.9% Terminal-Bench. The repo's primary agent. |
| **Codex CLI**   | GPT-5.5 tops Terminal-Bench at ~83.4%.                                                                      |
| **OpenCode**    | Biggest 2026 shift: ~172K stars, 75+ providers; free/OSS.                                                   |
| **Gemini CLI**  | Added Plan Mode (structured plan before execution).                                                         |
| **Aider**       | ~80.7% SWE-bench Verified w/ Claude Sonnet; clean per-change git commits.                                   |
| **Cline**       | 5M+ installs, Apache-2.0, free, full model choice.                                                          |
| **Devin**       | Autonomous repo-level agent.                                                                                |

### 3. Pre-merge: AI code review

Greptile, **Cursor BugBot**, **Qodo**, **CodeRabbit**, Graphite, **SonarQube**, **Semgrep**, Augment — context-aware PR review, inline comments, codebase-aware analysis. (We already run Semgrep; the rest are candidates if PR-review automation expands.)

### 4. Infra glue: MCP

MCP interest is resurging mid-2026 (Firecrawl reports ~35% MoM usage growth). CLI suits token-efficient production pipelines; MCP suits auth, multi-tenancy, governance, and exposing agentic workflows to non-technical teams. We use 6 MCP servers already.

## Community signal (the discourse)

Sentiment in the window was notably skeptical, which is worth weighing against the vendor rankings:

- George Hotz: "the adoption of AI agents into software development will be one of the most costly mistakes in the field's history" — 3,996 upvotes ([r/webdev](https://www.reddit.com/r/webdev/comments/1tvsfgj/im_calling_it_now_the_adoption_of_ai_agents_into/)).
- "Cleaning up after AI rockstar developers" — 499 pts ([HN](https://news.ycombinator.com/)), and an "AI doomerism" thread on [r/ExperiencedDevs](https://www.reddit.com/r/ExperiencedDevs/comments/1u1xhqa/ai_doomerism/).
- Security caution: "Microsoft's open source tools were hacked to steal passwords of AI developers" — 561 pts on HN; two-thirds of professionals admit using AI tools at work without permission ([r/singularity](https://www.reddit.com/r/singularity/comments/1u56h6f/report_finds_twothirds_of_office_professionals/)).
- Tooling is standardizing on a known agent set: the `debtmap` provenance ruleset and `quelvio-agent-skills` both enumerate the same shortlist — Claude Code, Copilot, Cursor, Codex, Aider, Cline, Windsurf, Devin.

## Recommendations

1. **No editor/agent change needed** — Claude Code + Cursor match the market leaders.
2. **AI code review is the clearest gap-filler.** We run Semgrep (security) but no semantic PR reviewer. **CodeRabbit** or **Greptile** would slot in as a pre-merge layer alongside the existing `/code-review` skill and CI gates. Worth a scoped trial; gate on cost + signal-to-noise.
3. **Track OpenCode / Codex CLI** as alternative agent backends for `mbe agent` (multi-provider flexibility), but no migration pressure — `@mbe/agent-core` + Claude Code is working.
4. **Heed the skepticism** — the loudest community signal is about AI-generated "slop" and unreviewed output. Our existing quality gates (typecheck/test/lint, Reviewer Agent contract, green-main) are the right answer; keep them strict.

## Verdict

Our stack is aligned with the 2026 consensus on editors, agents, SDKs, and MCP. The one actionable opportunity is a **semantic AI code-review tool** (CodeRabbit / Greptile) as a pre-merge layer. Everything else is monitor-only.

---

### Sources

Reddit (r/webdev George Hotz thread, r/ExperiencedDevs, r/singularity, r/LocalLLaMA); Hacker News; GitHub (`ardakutsal/debtmap`, `Quelvio/quelvio-agent-skills`). Web: [cosmicjs.com](https://www.cosmicjs.com/blog/claude-code-vs-github-copilot-vs-cursor-which-ai-coding-agent-should-you-use-2026), [faros.ai](https://www.faros.ai/blog/best-ai-coding-agents-2026), [greptile.com](https://www.greptile.com/content-library/best-ai-code-review-tools), [morphllm.com](https://www.morphllm.com/best-ai-coding-agents-2026), [dev.to](https://dev.to/thedailyagent/top-5-terminal-ai-coding-agents-in-2026-272), [firecrawl.dev](https://www.firecrawl.dev/blog/agentic-ai-trends). Raw engine dump: `~/Documents/Last30Days/ai-tools-for-software-development-raw-v3.md`.
