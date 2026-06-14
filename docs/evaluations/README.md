# Technology Evaluations

Point-in-time evaluations of third-party tools, providers, and architectural choices for this monorepo. Each file is a dated snapshot — it reflects the landscape and our stack at the time of writing, not necessarily today.

> **Adding one:** name the file `YYYY-MM-DD-<topic>.md`, start with an `# <Title> — <Month Year>` H1, and add a row to the table below. Keep the format of a recent entry (Current State table → landscape → recommendation/verdict).

## Index

| Date       | Evaluation                                                                   | Topic                                                                    |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 2026-06-14 | [AI Tools for Software Development](./2026-06-14-ai-dev-tools.md)            | AI editors, terminal agents, code-review, and MCP; mapped to our stack   |
| 2026-06-14 | [AI Tools for React Development](./2026-06-14-ai-tools-react.md)             | AI editors, app builders, and in-app SDKs for React; mapped to our stack |
| 2026-05-09 | [Multi-Agent Orchestrator](./2026-05-09-multi-agent-orchestrator.md)         | Orchestrators for Claude/Gemini/OpenCode                                 |
| 2026-04-05 | [Root Signals](./2026-04-05-root-signals.md)                                 | Agent self-improvement / eval signals                                    |
| 2026-03-27 | [AI Providers for Generative UI](./2026-03-27-ai-providers-generative-ui.md) | LLM providers for generative UI                                          |
| 2026-03-27 | [Generative UI Frameworks](./2026-03-27-generative-ui-frameworks.md)         | Frameworks for generative/JSON-driven UI                                 |
| 2026-03-25 | [Routing Architecture](./2026-03-25-routing-architecture.md)                 | App routing approach                                                     |
| 2026-02-26 | [Analytics & Feature Flags](./2026-02-26-analytics-feature-flags.md)         | Product analytics + feature flags                                        |
| 2026-02-26 | [Auth Providers](./2026-02-26-auth-providers.md)                             | Authentication providers                                                 |
| 2026-02-26 | [Background Jobs](./2026-02-26-background-jobs.md)                           | Background jobs / task queue                                             |
| 2026-02-26 | [Caching](./2026-02-26-caching.md)                                           | Caching layer                                                            |
| 2026-02-26 | [CI/CD Providers](./2026-02-26-ci-cd-providers.md)                           | Build / runner providers                                                 |
| 2026-02-26 | [Database Providers](./2026-02-26-database-providers.md)                     | Database providers                                                       |
| 2026-02-26 | [E2E Testing](./2026-02-26-e2e-testing.md)                                   | End-to-end testing framework                                             |
| 2026-02-26 | [Email & SMS Providers](./2026-02-26-email-sms-providers.md)                 | Transactional email / SMS                                                |
| 2026-02-26 | [Frontend Meta-Frameworks](./2026-02-26-frontend-meta-frameworks.md)         | Frontend meta-framework                                                  |
| 2026-02-26 | [Hosting / PaaS Providers](./2026-02-26-hosting-providers.md)                | Hosting / PaaS                                                           |
| 2026-02-26 | [IaC Tooling](./2026-02-26-iac-tooling.md)                                   | Infrastructure-as-code tooling                                           |
| 2026-02-26 | [Monorepo Tooling](./2026-02-26-monorepo-tooling.md)                         | Monorepo package manager / build orchestrator                            |
| 2026-02-26 | [Object Storage](./2026-02-26-object-storage.md)                             | Object storage                                                           |
| 2026-02-26 | [Observability / Monitoring](./2026-02-26-observability-monitoring.md)       | Observability + monitoring                                               |
| 2026-02-26 | [Payment Processing](./2026-02-26-payment-processing.md)                     | Payment processing                                                       |
| 2026-02-26 | [Real-Time Updates](./2026-02-26-real-time.md)                               | Real-time updates                                                        |

## Related

- Active third-party evaluation **queue** (what to evaluate next) is tracked in the AI assistant's project memory, not here.
- Tool-adoption decisions that change the codebase should also land as an ADR in [`docs/adr/`](../adr/).
