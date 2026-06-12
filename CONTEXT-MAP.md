# Context Map

This monorepo has four domain contexts. Each context owns a `CONTEXT.md` glossary (created lazily by `/grill-with-docs` — absence is normal) and may keep context-scoped ADRs in a `docs/adr/` directory next to it. System-wide ADRs live in [docs/adr/](docs/adr/).

| Context            | Glossary                         | Covers                                                                                                         |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Hospitality**    | `apps/hospitality/CONTEXT.md`    | `apps/hospitality`, `services/reservations`, `services/users` — guests, reservations, bookings, floor plans    |
| **Rialto**         | `packages/rialto/CONTEXT.md`     | `packages/rialto`, `packages/rialto-catalog`, `packages/rialto-plugin`, `apps/rialto-web` — the design system  |
| **Agent platform** | `packages/agent-core/CONTEXT.md` | `packages/agent-core`, `services/agent`, `apps/gen`, `tools` (mbe CLI) — sessions, adapters, evaluation, loops |
| **Platform**       | `docs/platform/CONTEXT.md`       | `infrastructure/worker` (edge-router), `packages/{api-versioning,auth,observability,config,…}` — cross-cutting |

Consumer rules for agents: [docs/agents/domain.md](docs/agents/domain.md).
