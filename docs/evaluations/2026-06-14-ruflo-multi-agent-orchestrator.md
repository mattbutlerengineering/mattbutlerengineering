# Ruflo (Multi-Agent Claude Code Orchestrator) Evaluation — June 2026

**Date:** 2026-06-14
**Status:** Complete
**Issue:** #2235

---

## Context and Why Now

Our home-grown orchestration stack — `/implement-queue`, `mbe agent run/orchestrate`, RemoteTriggers, and the GitHub label state machine — has reached ACMM L6 maturity. The May 2026 multi-agent orchestrator evaluation (#1164, `2026-05-09-multi-agent-orchestrator.md`) concluded we should build in-house rather than adopt any third-party wrapper because no tool provided the right fit without replacing our pipeline.

Ruflo (formerly Claude Flow) has since released v3.5.0 (its first declared stable release, February 2026), rebranded from `claude-flow` to `ruflo`, crossed 60,000 GitHub stars, and is now marketed specifically as a "meta-harness" layer for Claude Code — not a pipeline replacement. The framing changed enough that a separate evaluation is warranted.

---

## Candidate: Ruflo

| Dimension           | Value                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------- |
| **Package**         | `ruflo` on npm (also `@claude-flow/cli` as the underlying package)                           |
| **Repo**            | github.com/ruvnet/claude-flow (61k stars, 7k forks as of June 2026)                          |
| **License**         | MIT                                                                                          |
| **Author**          | ruvnet (solo maintainer)                                                                     |
| **Current version** | 3.13.3 (latest/alpha tag)                                                                    |
| **First stable**    | 3.5.0 — 2026-02-27 (rebranding from Claude Flow; 5,800+ commits over 10 months pre-stable)   |
| **npm downloads**   | ~256k last 30 days; ~598k YTD 2026 (ruflo alone); ~520k YTD 2026 (claude-flow)               |
| **Ecosystem claim** | "8.1M+ ecosystem downloads" — includes all ruvnet packages (unverified aggregate, see notes) |
| **Language**        | TypeScript (thin CLI wrapper; underlying runtime in early-Rust migration)                    |
| **Install**         | `npx ruflo@latest init` or `npm install -g ruflo`                                            |
| **MCP surface**     | ~210 tools (at CLI install; 18-tool browser WASM gallery also documented)                    |
| **Plugins**         | 35 Claude Code plugins via plugin marketplace; 21 npm-published plugins                      |
| **Claimed agents**  | 98 agents (full CLI install), 60+ commands, 30 skills                                        |

### What It Is

Ruflo positions itself as the "execution layer" above Claude Code, not a replacement for it. The core claim: "Agent = Model + Harness" — Claude Code is the model writer; Ruflo is the harness that adds swarms, persistent vector memory, background workers, and cross-machine federation.

Two install paths with very different surface areas:

- **Plugin (lite):** `/plugin install ruflo-core@ruflo` — adds slash commands and agent definitions per plugin. No MCP server registration. No hooks. No daemon. Lowest commitment.
- **CLI (full):** `npx ruflo init` — installs `.claude/`, `.claude-flow/`, `CLAUDE.md` overrides, hooks, daemon, and the full MCP server. All 98 agents, 60 commands, 314 MCP tools (as described in README). This is the "production" path.

### Notable Capabilities

- **Swarm coordination:** hierarchical, mesh, and adaptive topologies; Raft consensus; Queen-led dispatch. Background workers spawn sub-agents automatically for defined task types.
- **Vector memory (AgentDB):** HNSW-indexed local vector database for persistent cross-session memory. The README presents internal benchmarks showing 1.9x–4.7x speedup over brute force above crossover-N — the methodology and comparison baseline are noted in their own audit doc, not independently verified.
- **Self-learning (SONA):** learns from successful task patterns and applies them to future routing. "89% routing accuracy" is a vendor claim without a published evaluation methodology.
- **Agent federation:** zero-trust cross-machine agent communication via mTLS + ed25519. PII scrubbing pipeline before messages leave a node. Behavioral trust scoring.
- **35 plugins / 21 npm packages:** cover security auditing, browser automation, docs gen, domain-driven design, observability, cost tracking, database migrations, neural trading (domain-specific), IoT, and more.
- **Multi-provider routing:** Claude, GPT, Gemini, Cohere, Ollama with automatic failover.
- **Web UI (flo.ruv.io):** hosted multi-model chat frontend with parallel MCP tool calls. Self-hostable via Docker.
- **GOAP planner (goal.ruv.io):** hosted A\* goal decomposition with live agent dispatch. Self-hostable.

---

## Vendor Claim Verification

| Claim                                         | Status                 | Notes                                                                                                                                                                                                 |
| --------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~75% API cost reduction                       | **Not found**          | This figure appears in the issue description but is not present in the current v3.5+ README, CHANGELOG, or user guide. It may have appeared in earlier claude-flow marketing. Treat as unverified.    |
| ~500k downloads                               | **Verified (low)**     | ruflo: ~598k YTD 2026; claude-flow (previous package): ~520k YTD 2026. The issue's "~500k" figure is plausible but conservative; combined is higher. Npm download counts are easily inflated by bots. |
| 8.1M+ ecosystem downloads                     | **Unverifiable**       | Includes all ruvnet-published packages (ruvector, agentdb, agentic-flow, etc.). Not attributable to Ruflo alone. The README links to a `clone-data.proof.json` JSON file, not a public audit.         |
| ~49 top-level commands                        | **Roughly correct**    | README documents 60+ commands for the full CLI install. Issue's "~49" appears to be from an older version snapshot.                                                                                   |
| ~32 Claude Code plugins                       | **Undercount**         | Current README lists 35 plugins across all categories; the plugin marketplace shows more. 32 may reflect an earlier count.                                                                            |
| 300+ MCP tool surface                         | **Plausible range**    | README states "314 MCP tools" in one place and "~210 tools" in the Web UI section. The discrepancy reflects different counting (CLI vs browser WASM gallery). Neither is independently audited.       |
| SQLite local + distributed memory sync        | **Partially verified** | AgentDB is documented as HNSW vector DB. SQLite as the local store is not explicitly stated in current docs — may have applied to earlier versions. Distributed sync is the federation feature.       |
| Renamed from Claude Flow at v3.5.0 (Feb 2026) | **Verified**           | CHANGELOG explicitly states "Ruflo v3.5 — First Major Stable Release" on 2026-02-27 with "Rebranding: Claude Flow -> Ruflo."                                                                          |
| 60,910 GitHub stars                           | **Verified**           | Confirmed via GitHub API on 2026-06-22.                                                                                                                                                               |
| Solo maintainer (ruvnet)                      | **Verified**           | npm maintainer is ruvnet. The CHANGELOG and commit history show a single author pattern with AI-assisted generation.                                                                                  |

---

## Capability Comparison

| Dimension                          | Ruflo (full CLI install)                                                                             | Our Stack                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Orchestration model**            | Swarm with Queen-led hierarchy; automatic agent spawning via hooks and daemon                        | `/implement-queue`: parallel TDD worktree agents, manual claim batch, serial merge train                                                  |
| **Task dispatch**                  | Automatic routing via hooks; "89% routing accuracy" (vendor claim)                                   | `mbe agent run` / `mbe agent orchestrate` dispatch to Claude Code / Gemini / OpenCode adapters; manual issue pickup via `/issue-worker`   |
| **Memory / cross-session context** | HNSW vector AgentDB — persistent local; semantic retrieval; SONA self-learning                       | OMEGA (cross-session store, per-conversation), claude-mem (`/mem-search`, `/smart-explore`), `graphify` knowledge graph                   |
| **Issue queue integration**        | No built-in GitHub issue queue. Works alongside GitHub but does not consume our label state machine. | Deep GitHub label state machine (`ready` -> `in-progress` -> `has-pr` -> `agent-failed`); RemoteTriggers drive scheduled pickup           |
| **Scheduled automation**           | Loop workers, background daemon, 12 auto-triggered background workers                                | 7 RemoteTriggers (daily/weekly/monthly cadence on claude.ai/code/scheduled); `/learning-loop` sensor pipeline                             |
| **CI / quality gates**             | No built-in CI integration (no equivalent of `/ci-monitor`)                                          | `/ci-monitor` auto-fixes simple failures; merge train with required CI Gate; pre-commit ESLint + ADR + pack-changed hooks                 |
| **Site audit / observability**     | `ruflo-observability` plugin (structured logs/traces/metrics); `ruflo-security-audit`                | `/site-audit` (Playwright + Lighthouse); Langfuse for LLM traces; Sentry via `/sentry-triage`; ACMM audit                                 |
| **Multi-provider failover**        | 5 providers (Claude, GPT, Gemini, Cohere, Ollama) with router                                        | `mbe agent run --adapter` (claude/gemini/opencode/auto); no HTTP 429 auto-failover (known gap from prior eval)                            |
| **Worktree isolation**             | Not explicitly modeled; agents run inline in the current session environment                         | Each `implement-queue` worker gets an isolated git worktree; contamination risks have documented mitigations in gotchas.md                |
| **Plugin/skill extensibility**     | 35 plugins; `/plugin install` from marketplace; `ruflo-plugin-creator` to scaffold new ones          | Skills in `.claude/skills/`; mbe CLI plugins; plugins directory                                                                           |
| **ADR / architecture governance**  | `ruflo-adr` plugin; `ruflo-metaharness` (grade agent setup readiness 1-100)                          | `check-adr` CLI gate (enforced in CI and pre-commit); `check-deps` architectural constraint enforcement                                   |
| **Federation / cross-machine**     | Full mTLS + ed25519 zero-trust federation; PII scrubbing; behavioral trust scoring                   | Not a use case — single-machine solo-developer setup                                                                                      |
| **Web UI**                         | flo.ruv.io (hosted beta); Docker self-hostable; multi-model chat with parallel MCP calls             | No equivalent (not a current pain point)                                                                                                  |
| **Setup cost**                     | `npx ruflo init` rewrites `CLAUDE.md`, installs `.claude-flow/`, hooks, and daemon into your repo    | Zero extra install — skills and `/implement-queue` are already part of the repo                                                           |
| **Ownership / lock-in**            | Solo maintainer; MIT; 60k stars but single bus-factor; ruflo npm package wraps `@claude-flow/cli`    | Fully in-house; no external dependency; we own every line                                                                                 |
| **CLAUDE.md conflict risk**        | Full install overwrites or heavily augments the project `CLAUDE.md` and adds `.claude-flow/` config  | Our `CLAUDE.md` is the behavioral contract that defines caveman mode, Zero-Touch Audit, gotcha rules, and the continuous improvement loop |

---

## Risk Analysis

### Integration risks

**CLAUDE.md overwrite.** Ruflo's full CLI install writes its own `CLAUDE.md` into the repo root and installs `.claude-flow/` config. Our `CLAUDE.md` is the primary behavioral contract for all Claude Code sessions in this repo — it defines caveman mode, the Zero-Touch Audit, gotcha rules, and the continuous improvement loop. A Ruflo full install would overwrite or conflict with these. This is not a minor config merge; it is a behavioral takeover.

**Worktree contamination.** Ruflo's hooks and daemon run at the session level. Worktree-isolated `implement-queue` agents already have documented contamination risks (chaos-agent hijack, shared-checkout branch poltergeist). Adding a Ruflo daemon that manages the same worktree environment creates new contamination vectors that are harder to audit.

**Behavioral convention drift.** Ruflo's own agent definitions and skill framework compete with our `.claude/skills/` and plugin conventions. The MetaHarness feature grades against Ruflo's own maturity model, not our ACMM.

### Maturity and maintenance risks

**Solo maintainer at high velocity.** The repo has 60k stars and 5,800+ commits accumulated over roughly 10 months (June 2025 to stable in February 2026). The commit density pattern and AI-assisted generation make code quality auditing difficult. A solo maintainer with 667 open issues is a real bus-factor risk for a production dependency.

**Unstable surface.** The package has gone through 274 published versions across alpha, v3alpha, and latest tags. The gap between 3.1.0-alpha.55 and the next stable at 3.13.3 suggests rapid iteration without semantic version discipline. Features present today may be refactored or removed in patch releases.

**Dependency chain opacity.** The ruflo npm package is a thin wrapper that depends on `@claude-flow/cli`. Auditing the full dependency graph (agentdb, agentic-flow, ruvector, etc.) is non-trivial.

### Cost and performance claims

The "~75% API cost reduction" figure from the issue description does not appear in the current README, CHANGELOG, or user guide. It may have originated in earlier Claude Flow marketing or community discussions. No methodology for measuring it is published. Cost reduction from cross-session memory is plausible in theory (fewer repeated context loads) but the magnitude is unverified.

---

## Recommendation: Skip

**Do not adopt Ruflo in any form at this time.**

### Primary reason: architectural conflict

The full CLI install — which is required to get swarm orchestration, the daemon, and the MCP server — rewrites our `CLAUDE.md` and installs its own behavioral layer. Our `CLAUDE.md` is the behavioral contract that makes our continuous improvement loop work correctly. This is not a merge conflict; it is a fundamental incompatibility.

The plugin (lite) path avoids this problem but also avoids the features that would close our gaps. The plugin path gives you slash commands and agent definitions only — no MCP server, no hooks, no persistence. That is not a meaningful capability addition.

### Secondary reason: our pipeline already addresses the gaps

The May 2026 evaluation reached the same conclusion for the same reason: our gap is narrow and Ruflo fills the wrong shape. We need multi-CLI dispatch (HTTP 429 failover) and that is approximately 500 lines in `@mbe/agent-core`. Ruflo's multi-provider routing is a real feature, but getting it requires taking on the entire Ruflo behavioral overlay.

The capabilities that look novel from Ruflo's README are already covered by our stack:

- **Memory:** OMEGA, claude-mem, graphify
- **Self-learning:** `/learning-loop` sensor pipeline, the gotcha-harvest habit, ACMM self-audit
- **Scheduled workers:** 7 RemoteTriggers on claude.ai/code/scheduled

### What about the interesting pieces?

Two Ruflo capabilities are genuinely interesting but not compelling enough to adopt the package:

1. **AgentDB (HNSW vector memory).** The idea of fast local vector search for agent memory is sound. If we want this, the right move is to evaluate `@ruvnet/agentdb` as a standalone dependency for `@mbe/agent-core`, not to install Ruflo. The package can be evaluated independently.

2. **ruflo-metaharness (agent setup grading).** The concept of grading your agent setup readiness (1-100 score, tool config security scan, regression snapshots) is interesting and complementary to our ACMM audit. This could be evaluated independently — but given the solo-maintainer risk and our own ACMM investment, the marginal value is low.

Neither piece justifies taking on Ruflo as a whole.

---

## Decision Matrix

| Scenario                                                     | Recommended Action                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Close the HTTP 429 / multi-CLI failover gap                  | Build in agent-core: Gemini + OpenCode adapters + rate-limit detection (~500 LOC)        |
| Cross-session memory is insufficient with OMEGA + claude-mem | Evaluate `@ruvnet/agentdb` as a standalone dependency — audit bus factor first           |
| Ruflo matures to multi-maintainer, stable API, v4+           | Re-evaluate at that inflection point; CLAUDE.md overwrite must be resolved               |
| Team grows to 5+ developers who need federation              | Re-evaluate Ruflo's federation layer specifically; it is the only unique capability here |
| Want to try Ruflo's GOAP goal planner                        | Use goal.ruv.io as a hosted experiment; no local install required                        |

---

## Summary

| Component            | Verdict | Notes                                                                |
| -------------------- | ------- | -------------------------------------------------------------------- |
| **Full CLI install** | Skip    | Rewrites CLAUDE.md; behavioral takeover; solo-maintainer bus factor  |
| **Plugin (lite)**    | Skip    | No MCP server, no hooks, no persistence — too thin to close any gap  |
| **AgentDB alone**    | Watch   | Evaluate as a standalone `@mbe/agent-core` dep if memory gaps emerge |
| **MetaHarness**      | Watch   | Interesting concept; ACMM covers this use case already               |
| **GOAP planner**     | Explore | Hosted demo at goal.ruv.io; zero local install; low-risk experiment  |

---

## Re-Evaluation Triggers

1. **Ruflo v4 stabilizes with a non-destructive install path** — if the full CLI install can coexist with an existing `CLAUDE.md` rather than overwrite it, the conflict reason dissolves.
2. **Second maintainer joins** — bus factor 1 at 60k stars is the single biggest durability risk; a co-maintainer changes the calculus.
3. **Independent cost/performance benchmarks published** — the "75% cost reduction" and "89% routing accuracy" claims need methodology before they can inform decisions.
4. **We adopt multi-machine or multi-org agent coordination** — the federation layer is the one piece with no equivalent in our stack.
5. **Prior multi-agent eval (Bernstein) matures** — if Bernstein reaches multi-maintainer stability, it remains the better architectural fit (wraps our pipeline rather than replacing it).

---

## Sources

- [Ruflo README (github.com/ruvnet/claude-flow main)](https://github.com/ruvnet/claude-flow/blob/main/README.md) — read 2026-06-22
- [Ruflo CHANGELOG](https://github.com/ruvnet/claude-flow/blob/main/CHANGELOG.md) — verified 3.5.0 rebranding date and history
- [ruflo npm registry](https://registry.npmjs.org/ruflo) — version count, latest tag, dependency on `@claude-flow/cli`
- [npm download stats (ruflo)](https://api.npmjs.org/downloads/point/2026-01-01:2026-06-22/ruflo) — 598,395 YTD 2026
- [npm download stats (claude-flow)](https://api.npmjs.org/downloads/point/2026-01-01:2026-06-22/claude-flow) — 519,546 YTD 2026
- [GitHub API (ruvnet/claude-flow)](https://api.github.com/repos/ruvnet/claude-flow) — 60,910 stars, 7,079 forks, 667 open issues as of 2026-06-22
- [docs/evaluations/2026-05-09-multi-agent-orchestrator.md](./2026-05-09-multi-agent-orchestrator.md) — prior multi-agent eval; Bernstein/Composio AO/build-in-house decision
- [CLAUDE.md](../../CLAUDE.md) — continuous improvement loop, RemoteTriggers, skill catalog
- [AGENTS.md](../../AGENTS.md) — orchestration stack, `mbe agent` commands, ACMM pipeline
