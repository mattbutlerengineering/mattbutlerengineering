# Code Knowledge-Graph Tools Evaluation — June 2026

> **Context:** This eval was triggered by issue #2216 after the `/graphify` skill shipped in May 2026. Two new tools — CodeGraph and Understand Anything — emerged as potential replacements or complements. The question: do either of them save agent token/tool-call budget meaningfully enough on this monorepo to justify adding or replacing `/graphify`?

## Current State

| Dimension            | Value                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Current tool**     | `/graphify` (`~/.claude/skills/graphify/SKILL.md`, graphifyy PyPI v0.8.39)                                                        |
| **Graph type**       | LLM-extracted concept/symbol graph + AST structural graph, merged                                                                 |
| **Storage**          | `graphify-out/graph.json` (gitignored, per-session)                                                                               |
| **Integration**      | Claude Code skill + optional MCP (`--mcp`)                                                                                        |
| **Trigger**          | Manual (`/graphify <path>` or `/graphify query "..."`)                                                                            |
| **Use cases active** | Onboarding subsystems, architecture audits, agent context priming, PR blast-radius                                                |
| **Agent impact**     | Once `graphify-out/graph.json` exists, question-answering pulls from BFS/DFS traversal (token-budgeted) instead of grepping files |
| **Artifact policy**  | `graphify-out/` is gitignored — graph artifacts never pollute git or CI                                                           |

### What graphify does well here

- Symbol/concept-level graph rather than package-level (complementary to `docs/architecture/dependency-graph.md` which is CI-enforced at the package-level)
- Community detection surfaces cross-file couplings worth auditing
- One-shot answer from a pre-built graph is cheaper than repeat grep/read chains
- `--mcp` mode exposes the graph to agent tools in a running session

### Current pain with graphify

- Initial build requires LLM extraction for semantic nodes (cost: tokens per run on non-code files)
- Graph is ephemeral — lives only while `graphify-out/` exists; rebuild on each fresh checkout
- Auto-sync on file changes is not wired up (manual `--update` required)
- Installation requires Python 3.10+ and bootstrapping `graphifyy` via `uv tool` or `pip`
- No per-agent tool call optimization — benefits come from reducing reads in the session, not from a pre-indexed query interface the agent can call in one shot

---

## Candidates

### 1. CodeGraph — https://github.com/colbymchenry/codegraph

**What it is:** A pre-indexed code knowledge graph purpose-built for AI agents. SQLite + FTS5 storage, tree-sitter extraction (20+ langs), self-contained Node bundle (no runtime install required), file-watch auto-sync, and a single `codegraph_explore` MCP tool that returns relevant symbols with call paths and blast-radius in one call.

| Dimension                   | Details                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------- |
| **Version**                 | 1.0.1 (released 2026-06-13)                                                             |
| **Stars**                   | 53,132 (as of 2026-06-22)                                                               |
| **Forks**                   | 3,242                                                                                   |
| **Language**                | TypeScript                                                                              |
| **License**                 | MIT                                                                                     |
| **Graph type**              | Structural / call-graph (tree-sitter AST — deterministic)                               |
| **Storage**                 | `.codegraph/codegraph.db` (SQLite, per-project)                                         |
| **Sync**                    | OS file-watch daemon, 2-second debounce — always current                                |
| **Install**                 | One-line shell installer (no Node.js required; bundles own runtime) or `npm i -g`       |
| **MCP**                     | Single `codegraph_explore` tool — "relevant symbols' source + call paths in one shot"   |
| **Languages supported**     | 20+ including TS/JS/Python/Go/Rust/Java/C#/PHP/Ruby/Swift/Kotlin/Svelte/Vue/Astro       |
| **Local-first**             | 100% — index lives in `.codegraph/`                                                     |
| **Telemetry**               | Anonymous usage stats (command/language counts); opt-out with `codegraph telemetry off` |
| **Claude Code integration** | Auto-wired by `codegraph install` — writes MCP config                                   |

**Benchmark claims (vendor, re-validated Opus 4.8, 2026-06-02):** Across 7 real-world repos, median of 4 runs:

| Codebase             | Tool calls | Time       | File reads |
| -------------------- | ---------- | ---------- | ---------- |
| VS Code (~10k files) | 81% fewer  | 11% faster | 0 vs 9     |
| Django (~3k)         | 77% fewer  | 13% faster | 0 vs 9     |
| Alamofire (~110)     | 58% fewer  | 33% faster | 0 vs 9     |
| Excalidraw (~640)    | 40% fewer  | 27% faster | 0 vs 7     |

The universal win the vendor claims on every tested codebase: **58% fewer tool calls, 22% faster, file reads reduced to near-zero.** Token/cost savings are modest at small-to-medium scale (even or ~25% cheaper) and compound to material savings only at 10k+ file scale.

**Key architectural difference from graphify:** CodeGraph is purely structural (AST-derived, deterministic). It has no LLM extraction phase — no semantic summaries, no community detection, no "what this module is _for_" context. The `codegraph_explore` tool surfaces exact source code and call paths; the agent still derives intent from the code itself.

**Caveat:** All benchmarks are vendor-provided. Coverage figures (e.g., TypeScript 95.8% cross-file coverage, validated on this repo's own codebase) are self-reported. Independent third-party validation is not available as of this writing.

---

### 2. Understand Anything — https://github.com/Egonex-AI/Understand-Anything

**What it is:** A Claude Code plugin (also available for Codex, Cursor, Copilot, Gemini CLI, etc.) that runs a multi-agent pipeline over a codebase to produce a structural + semantic knowledge graph with an interactive web dashboard. Output: `.understand-anything/knowledge-graph.json` (committable).

| Dimension           | Details                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Version**         | 2.7.3 (released 2026-05-19)                                                                                                      |
| **Stars**           | 66,089 (as of 2026-06-22)                                                                                                        |
| **Forks**           | 5,484                                                                                                                            |
| **Language**        | TypeScript                                                                                                                       |
| **License**         | MIT                                                                                                                              |
| **Graph type**      | Structural (tree-sitter) + semantic (LLM-generated summaries, domain mapping, guided tours)                                      |
| **Storage**         | `.understand-anything/knowledge-graph.json` (committable JSON)                                                                   |
| **Sync**            | Incremental (`/understand --auto-update` via post-commit hook) or manual re-run                                                  |
| **Install**         | Claude Code: `/plugin marketplace add Egonex-AI/Understand-Anything`                                                             |
| **Agent interface** | Claude Code slash commands: `/understand`, `/understand-chat`, `/understand-diff`, `/understand-domain`, `/understand-dashboard` |
| **Dashboard**       | Interactive web UI (force-directed graph, fuzzy+semantic search, persona-adaptive detail)                                        |
| **Languages**       | TS/JS/Python; tree-sitter covers more (same extraction tier as CodeGraph)                                                        |
| **Local-first**     | Yes — graph JSON is local (committable to share with team)                                                                       |
| **Initial cost**    | High token usage on first `/understand` (full codebase LLM extraction)                                                           |
| **Subsequent runs** | Incremental — only changed files re-analyzed                                                                                     |

**What it does that the others don't:** A web dashboard with guided tours, persona-adaptive UI, business-domain extraction (`/understand-domain`), and semantic search. The committed graph artifact enables team sharing and async onboarding without re-running the pipeline.

**Key architectural difference from graphify:** Understand Anything is closer in spirit to graphify — both produce semantic + structural graphs using LLMs. The distinction is that Understand Anything is delivered as a Claude Code plugin with slash commands and a web dashboard; graphify is a skill (prompt file) that drives Python tooling. Understand Anything's graph is committable and shareable; graphify's is ephemeral.

**Key difference from CodeGraph:** Understand Anything is a developer-onboarding and architecture-visualization tool. It does not expose a single-tool MCP interface for per-query agent context retrieval. Agent integration is via slash commands in chat, not an always-on MCP server the agent calls during task execution.

---

## Comparison

| Criterion                | graphify (current)                               | CodeGraph                                 | Understand Anything                       |
| ------------------------ | ------------------------------------------------ | ----------------------------------------- | ----------------------------------------- |
| **Primary use**          | Concept-level exploration, agent context priming | Per-query agent context (tool calls)      | Onboarding, visualization, domain mapping |
| **Graph type**           | AST + LLM semantic                               | AST structural only                       | AST + LLM semantic                        |
| **Agent integration**    | Skill + optional MCP                             | MCP tool (`codegraph_explore`)            | Slash commands                            |
| **Always-on sync**       | No (manual `--update`)                           | Yes (OS file-watch daemon)                | Optional (post-commit hook)               |
| **Install**              | Python 3.10+, uv/pip                             | Self-contained bundle                     | Claude Code plugin                        |
| **Storage**              | Ephemeral (`graphify-out/`, gitignored)          | Per-project SQLite (`.codegraph/`)        | Committable JSON                          |
| **First-run cost**       | LLM extraction per non-code file                 | Zero (AST only)                           | High LLM extraction                       |
| **Per-query cost**       | BFS/DFS traversal of cached graph                | One MCP tool call                         | Slash command                             |
| **Benchmark data**       | None published                                   | Vendor benchmarks (7 repos, re-validated) | None published                            |
| **Tool-call reduction**  | Untested                                         | 40-81% fewer (vendor)                     | Untested                                  |
| **Community detection**  | Yes                                              | No                                        | Yes (architectural layers)                |
| **Semantic summaries**   | Yes                                              | No                                        | Yes                                       |
| **Domain/business view** | No                                               | No                                        | Yes (`/understand-domain`)                |
| **Web dashboard**        | HTML viz (`graphify export html`)                | No                                        | Yes (interactive)                         |
| **Stars**                | Not tracked (graphifyy PyPI)                     | 53,132                                    | 66,089                                    |
| **Maturity**             | v0.8.x, PyPI package                             | v1.0.1, January 2026 launch               | v2.7.x, active releases                   |
| **License**              | MIT                                              | MIT                                       | MIT                                       |
| **Local-first**          | Yes                                              | Yes                                       | Yes                                       |

---

## Analysis

### Does CodeGraph replace graphify?

**No. They occupy different positions.**

graphify is a concept-level explorer: it extracts _what a module means_ (LLM-derived intent, summaries, community clusters) alongside _what it calls_ (AST edges). The primary use in this repo is architecture audits and onboarding unfamiliar subsystems — questions like "how does the booking widget reach the reservations service?" that benefit from semantic context, not just call edges.

CodeGraph is a structural call-graph that makes agents faster during task execution. Its `codegraph_explore` MCP tool is purpose-built for the "agent needs to find the right 5 methods in a 500-file repo" problem — it surfaces verbatim source and call paths in one tool call, collapsing what would otherwise be 10+ grep/read round-trips. The vendor benchmarks (40-81% fewer tool calls, 22% faster) are directionally credible even if the exact numbers are self-reported: replacing file-crawl loops with a single pre-indexed query is a genuine architectural win.

**The key distinction:** graphify helps _you_ understand a codebase. CodeGraph helps _the agent_ navigate a codebase during task execution. These are complementary, not competing.

### Does Understand Anything replace graphify?

**Overlap is higher, but the use cases still diverge.**

Both produce semantic + structural graphs using LLMs. But Understand Anything's value proposition is the web dashboard, guided tours, and team-sharing of a committed graph artifact. It is a developer-onboarding tool first and an agent-context tool second. The slash-command interface (`/understand-chat "how does auth work?"`) is less efficient for agent task execution than a dedicated MCP tool that returns structured context in one call.

For the current solo-developer setup — no team onboarding, no need for a shareable committed graph, primary use is agentic implementation cycles — the dashboard and guided tours do not address the actual pain point. And the high first-run LLM extraction cost plus the overhead of the multi-agent pipeline adds friction without a clear runtime payoff over graphify.

### The real gap: agent task-execution efficiency

Neither CodeGraph nor graphify was designed to be the same thing, and the current stack has a gap: **during `implement-queue` agent task execution, agents still crawl files via grep/read when they need context**. graphify helps if the graph was built beforehand and the question fits a BFS traversal, but it is not wired as an always-on per-task tool the agent calls in one shot.

CodeGraph fills exactly that gap. The MCP tool is always available once `codegraph init` runs and the auto-sync daemon keeps the index current. The agent calls `codegraph_explore` once and gets the relevant symbols' source, call paths, and blast-radius — replacing the grep/glob/read loop that is the dominant pattern in this repo's agent sessions.

---

## Recommendation

**Adopt CodeGraph as an augmentation layer on top of graphify. Do not replace graphify.**

| Tool                    | Verdict          | Rationale                                                                                                                                                                                                                                                                   |
| ----------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CodeGraph**           | **Adopt**        | Fills the agent task-execution gap. Always-on MCP server, zero-LLM-cost indexing, file-watch auto-sync. Run `codegraph init` in the monorepo root once; the agent gains `codegraph_explore` for every future session. Complementary to graphify, not a replacement.         |
| **Understand Anything** | **Skip for now** | Higher overlap with graphify (both semantic), web dashboard not needed for solo-developer setup, high initial LLM cost, slash-command interface less efficient than MCP for agent task execution. Re-evaluate if team grows or if cross-team onboarding becomes a priority. |
| **graphify**            | **Keep**         | Remains the right tool for architecture audits and subsystem onboarding where semantic intent matters. CodeGraph's structural graph does not replace this.                                                                                                                  |

### Adoption plan for CodeGraph

1. `codegraph install` — auto-wires MCP server into Claude Code's config
2. `codegraph init` (monorepo root) — builds the full index (zero LLM tokens)
3. File-watch auto-sync is enabled by default — no further maintenance
4. Add `!.codegraph/` to `.gitignore` (the index is local; do not commit)
5. In agent prompts, the `codegraph_explore` MCP tool is now available alongside Bash/Read — no skill file needed, no prompt changes required

**Estimated impact:** Based on vendor benchmarks across repos from 110 to 10k files, the tool-call reduction on this ~500-file monorepo would be in the 40-58% range for architecture questions. The actual measure that matters for `/implement-queue` workers is whether they finish tasks in fewer turns — that can be verified empirically after a one-session trial.

### Re-evaluation triggers

1. **Team grows to 3+ developers** — Understand Anything's committed graph and guided tours become worth the LLM extraction cost for async onboarding
2. **CodeGraph is slow or inaccurate on dynamic dispatch patterns** — this repo uses React hooks and higher-order functions extensively; if the structural graph misses those, supplement with graphify queries
3. **graphify ships an always-on MCP mode** — if graphify adds a session-persistent MCP server with per-query retrieval comparable to `codegraph_explore`, the two tools converge and the case for running both weakens

---

## Sources

- CodeGraph README: https://github.com/colbymchenry/codegraph (verified 2026-06-22; stars: 53,132; v1.0.1)
- Understand Anything README: https://github.com/Egonex-AI/Understand-Anything (verified 2026-06-22; stars: 66,089; v2.7.3)
- graphify skill: `.claude/skills/graphify/SKILL.md` (vendored v0.8.39)
- graphify boundaries section: `CLAUDE.md#knowledge-graph-graphify`
- CodeGraph release history: v1.0.0 (2026-06-12), v1.0.1 (2026-06-13), launched January 2026
- Understand Anything release history: v2.5.0 (2026-05-04), v2.7.3 (2026-05-19)
- CodeGraph benchmarks: vendor-published in README (re-validated on Opus 4.8, 2026-06-02); no independent third-party validation found
