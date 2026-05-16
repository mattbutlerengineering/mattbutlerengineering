# One-Man Dev Team — Quick Reference

## Synthetic Team Roster

| Agent           | Role    | Model   | One-Liner                                                 |
| --------------- | ------- | ------- | --------------------------------------------------------- |
| Product Manager | PM      | Opus    | Writes user stories, acceptance criteria, success metrics |
| Architect       | Design  | Opus    | System design, dependency analysis, technical planning    |
| Frontend Dev    | Build   | Sonnet  | React/UI components, styling, user flows                  |
| Backend Dev     | Build   | Sonnet  | API endpoints, database, business logic                   |
| QA Engineer     | Test    | Sonnet  | Test generation, bug finding, regression testing          |
| Code Reviewer   | Quality | Inherit | Code quality, security, best practices review             |
| Debugger        | Fix     | Inherit | Root cause analysis, fix implementation                   |
| DevOps          | Ship    | Haiku   | CI/CD, deployment, infrastructure                         |
| Docs Writer     | Docs    | Haiku   | API docs, README, changelogs                              |

---

## Tool Stack at a Glance

| Layer        | Tool                  | Why                                                    |
| ------------ | --------------------- | ------------------------------------------------------ |
| AI Coding    | Claude Code           | Deep codebase understanding, multi-agent orchestration |
| Hosting      | Vercel / Cloudflare   | Zero-config, serverless, generous free tier            |
| Database     | Supabase              | Postgres + Auth + Realtime, generous free tier         |
| CI/CD        | GitHub Actions        | Native to GitHub, free for public repos                |
| Monitoring   | Sentry                | Error tracking + performance, free tier                |
| Project Mgmt | TODO.md → Linear      | Start simple, upgrade when >50 items                   |
| Auth         | Clerk / Supabase Auth | Managed auth, minimal setup                            |
| Payments     | Stripe                | Industry standard, best docs                           |

---

## Daily Workflow Cadence

| Time Block          | Energy | Role         | Do This                                              |
| ------------------- | ------ | ------------ | ---------------------------------------------------- |
| Morning (2-3h)      | Peak   | Developer    | Deep work: core features, complex bugs, architecture |
| Late Morning (1-2h) | High   | QA/Review    | Review AI PRs, run tests, merge                      |
| After Lunch (1-2h)  | Medium | PM/Architect | Write specs, plan features, prioritize backlog       |
| Afternoon (2-3h)    | Medium | Developer    | Implementation, kick off parallel AI agents          |
| Late Afternoon (1h) | Low    | DevOps/Admin | Deploy, CI/CD, monitoring, email                     |
| End of Day (30m)    | Low    | Setup        | Queue AI agents for overnight/async work             |

---

## Key Metrics to Track

- **Revenue per hour worked** — the real productivity metric
- **Time to ship** — idea to deployed feature
- **Code churn rate** — how often AI code gets rewritten (target: <15%)
- **Automation ratio** — manual tasks vs automated
- **User feedback velocity** — how fast you learn from users

---

## Top 7 Anti-Patterns

1. **Tool Collecting** — Signing up for every AI tool. Fix: pick ONE, master it for 30 days.
2. **AI Productivity Illusion** — Feeling 2x faster while shipping the same. Fix: measure features deployed, not code generated.
3. **Over-Engineering** — Microservices for 0 users. Fix: monolith until proven otherwise.
4. **Building in Silence** — Coding for months before telling anyone. Fix: market from day 1.
5. **AI Technical Debt** — Accepting code you don't understand. Fix: review every line, test everything.
6. **Burnout Spiral** — Context-switching between 7 roles every hour. Fix: batch by role, not by task.
7. **Skill Erosion** — Never coding without AI. Fix: one manual session per week.

---

## Critical Stats

- 85% of devs use AI tools regularly (2025)
- 4.1 hrs/week saved by daily Claude Code users
- 19% slower with AI (perceived 24% faster) — 39-44% perception gap
- 1.7x more bugs in AI-generated code
- 8x increase in duplicated code blocks with AI
- 52.3% of successful exits by solo founders
- 38% of 2024 startups launched by solo founders (up from 22% in 2015)
- 73% of AI automation attempts fail in 90 days
- 208x more frequent deploys with CI/CD mastery
- $3K-$12K/year for a complete solopreneur stack (95-98% cost reduction vs traditional)

---

## Orchestration Patterns

| Pattern              | Flow                                                     | Best For              |
| -------------------- | -------------------------------------------------------- | --------------------- |
| Plan-Execute-Review  | Plan → Implement → QA → Review → Ship                    | New features          |
| Parallel Specialists | Lead creates plan → 3-4 agents in parallel → Synthesize  | Research, refactoring |
| Assembly Line        | PM → Architect → Dev → QA → Review (sequential handoff)  | Full feature dev      |
| Persistent Knowledge | Memory-enabled agents that learn your patterns over time | Long-term projects    |

---

## Quick Links

**Workflows & Tools:**

- [Boris Cherny's Claude Code Workflow (Jan 2026)](https://www.infoq.com/news/2026/01/claude-code-creator-workflow/)
- [Addy Osmani's LLM Coding Workflow](https://addyosmani.com/blog/ai-coding-workflow/)
- [Claude Code Subagents Docs](https://code.claude.com/docs/en/sub-agents)
- [Stripe Minions Architecture (Feb 2026)](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents)

**Inspiration:**

- [Pieter Levels — How I Build MVPs](https://levels.io/how-i-build-my-minimum-viable-products/)
- [Marc Lou — Ship Fast, Sell Faster](https://indiepattern.com/stories/marc-lou/)
- [Danny Postma — Solo AI Empire from Bali](https://supabird.io/articles/danny-postma-how-a-solo-hacker-built-an-ai-empire-from-bali)

**Research:**

- [METR Study — AI Impact on Developer Productivity](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- [AI-Generated Code Creates New Technical Debt](https://www.infoq.com/news/2025/11/ai-code-technical-debt/)
- [Solo Developer's Manifesto](https://github.com/fawazahmed0/the-solo-developers-manifesto)
