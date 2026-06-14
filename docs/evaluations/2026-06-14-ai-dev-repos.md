# Popular AI Dev Repos (Skills, Agents, Harnesses) Evaluation — June 2026

> Snapshot of the most-used AI development GitHub repos in the window, grounded in a `/last30days` pull (Reddit + Hacker News + GitHub project-mode, 56 items; star counts live from the GitHub API) plus web supplements. Triggered by three named examples — Ruflo, Matt Pocock's skills, CodeGraph — and mapped against what this monorepo already uses. Two of the three already have open eval issues.

## The three named repos

| Repo                                                                | Stars (live) | What it is                                                                                                                                           | Our status                                                                                                      |
| ------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [mattpocock/skills](https://github.com/mattpocock/skills)           | ~129K        | "Skills for Real Engineers" — Pocock's personal `.claude/` directory made public; markdown skill files that make Claude Code a workflow participant. | Unmined reference set                                                                                           |
| [ruvnet/ruflo](https://github.com/ruvnet/ruflo)                     | ~59K         | Multi-agent meta-harness for Claude (ex-Claude Flow): 314 MCP tools, 60+ agent types, swarms, adaptive memory.                                       | Eval issue [#2235](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/2235)                  |
| [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) | ~49K         | Pre-indexed code knowledge graph, auto-syncs on change; multi-agent-native; 100% local, fewer tokens/tool-calls.                                     | Eval issue [#2216](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/2216) (vs `/graphify`) |

## The 2026 phenomenon: skill/config collections

"Skills" (markdown instruction files) became the dominant share format this window.

- **Forrest Chang's single-file CLAUDE.md** — 4 behavioral rules distilled from Karpathy's AI-coding critique, reportedly ~144K stars. Core reframe: "give it success criteria, not instructions."
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) — 1000+ skills from official teams (Anthropic, Google, Vercel, Stripe, Cloudflare, Sentry, Figma) + community; Claude Code / Codex / Gemini CLI / Cursor compatible.
- [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) — #1 trending Feb 2026: 135 agents, 35 skills, 42 commands, 176+ plugins.
- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills), [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) — curated indexes.

Broader frameworks/builders also dominating by stars: OpenClaw (~210K, fastest-growing OSS ever), Langflow (~146K), Dify (~136K), browser-use (~86K), Flowise (~51K).

## Community signal

- **Skills-as-format is the moment.** "Claude Code as a Daily Driver: Claude.md, Skills, Subagents, Plugins, and MCPs" hit 451 pts on [HN](https://arps18.github.io/posts/claude-code-mastery/).
- **Security caution is now front-and-center.** The **Miasma worm** (June 5) weaponized this exact trend: malicious AI-agent config files (`alwaysApply: true`) across 73 Microsoft GitHub repos ran credential-harvesting payloads when opened in Claude Code / Cursor / Gemini CLI. No CVE — it abuses the trust model, so "open a repo" is a security boundary now ([StepSecurity](https://www.stepsecurity.io/blog/miasma-worm-hits-microsoft-again-azure-functions-action-and-72-other-repositories-disabled-after-supply-chain-attack-targeting-ai-coding-agents), [safedep](https://safedep.io/miasma-worm-ai-coding-agent-config-injection/)).

## What WE already use

This monorepo is heavily skills-and-agents driven.

| Category                  | Ours                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **In-repo skills / loop** | `/implement-queue`, `/site-audit`, `/issue-worker`, `/ci-monitor`, `/learning-loop`, `/progress-tracker`, `/sentry-triage`, `/acmm-audit`, `/decompose`, `/deploy` |
| **Agent runtime**         | `@mbe/agent-core` (`mbe agent run/orchestrate`), `@anthropic-ai/claude-agent-sdk`, Reviewer Agent contract, worktree TDD agents                                    |
| **Knowledge graph**       | graphify (`.claude/skills/graphify`) — our analog to codegraph                                                                                                     |
| **Memory**                | claude-mem (`/mem-search`, `/smart-explore`)                                                                                                                       |
| **Vendored skill packs**  | superpowers, gsd, claude-reflect, pr-review-toolkit, codex, opencode, auth0/sentry packs                                                                           |
| **MCP servers**           | github, langfuse, semgrep, sentry, root-signals, mbe-infra, context7, playwright, prisma                                                                           |

## Recommendations

1. **Mine mattpocock/skills (read-and-adapt, not adopt).** At 129K stars it's the reference for stronger Claude Code defaults. Worth a pass against our `.claude/skills` and `CLAUDE.md` — reference material, not a dependency.
2. **Let the two open eval issues run.** [#2216](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/2216) (codegraph vs graphify) and [#2235](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/2235) (ruflo vs implement-queue + mbe agent) already cover the other two named repos. codegraph's pre-indexed/auto-sync/multi-agent-native design is a genuine differentiator vs graphify's on-demand mapping — that eval should decide replace/augment.
3. **Treat any adopted third-party skill/config as untrusted input.** The Miasma worm is a direct argument for our Semgrep + Reviewer-agent gates. Never enable a downloaded `.claude` config / skill without review — `alwaysApply`-style rules are the attack vector.

## Verdict

The window's signal reinforces our direction: skills + agents + (eventually) a code graph. No new adoption is forced. Highest-value next step is a read-and-adapt pass over mattpocock/skills; codegraph and ruflo decisions stay gated on their open eval issues; security posture (review-before-trust) is non-negotiable given Miasma.

---

### Sources

GitHub project-mode (live stars): mattpocock/skills, ruvnet/ruflo, colbymchenry/codegraph. Reddit (r/ClaudeAI, r/singularity, r/PromptEngineering, r/LocalLLaMA); Hacker News. Web: [bytebytego.com](https://blog.bytebytego.com/p/top-ai-github-repositories-in-2026), [firecrawl.dev](https://www.firecrawl.dev/blog/best-github-repos), [stepsecurity.io](https://www.stepsecurity.io/blog/miasma-worm-hits-microsoft-again-azure-functions-action-and-72-other-repositories-disabled-after-supply-chain-attack-targeting-ai-coding-agents), [safedep.io](https://safedep.io/miasma-worm-ai-coding-agent-config-injection/). Raw engine dump: `~/Documents/Last30Days/popular-ai-dev-repos-skills-agents-harnesses-raw-v3.md`.
