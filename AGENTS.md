# AGENTS.md - Development Guidelines for AI Coding Agents

> **For Claude Code users**: The primary source of truth is [CLAUDE.md](./CLAUDE.md), which is auto-loaded into every session.
>
> This file exists as an alias for non-Claude AI tools (Cursor, GitHub Copilot, etc.) that look for AGENTS.md. Both files contain identical guidelines.

Please refer to [CLAUDE.md](./CLAUDE.md) for complete documentation on:
- Build/lint/test commands
- Code style guidelines
- Testing patterns
- API development conventions
- Local development setup
- Project architecture
- Continuous improvement loop (skills, labels, RemoteTriggers)

## Retry Strategy for Flaky Tasks

Turborepo's `retryCount` is configured for tasks that are prone to transient failures:

| Task | Attempts | Delay | Backoff |
|------|----------|-------|---------|
| `db:migrate` | 3 | 1000ms | Exponential |
| `test:contract` | 2 | 500ms | Linear (fixed) |

**How retries work:**
- `retryCount` in `turbo.json` tells Turbo to re-run a failed task up to N additional times.
- **Delay and backoff** are not native Turbo features — implement them at the script level using a retry wrapper (e.g., [`retry-cli`](https://github.com/nicolo-ribaudo/retry-cli)) or shell logic:

  ```bash
  # db:migrate with exponential backoff (1s, 2s, 4s)
  npx retry --times 3 --delay 1000 --exponential -- npx prisma migrate deploy

  # test:contract with fixed 500ms delay
  npx retry --times 2 --delay 500 -- pnpm test:contract
  ```

- `db:migrate` uses exponential backoff because database unavailability tends to persist briefly; spacing retries reduces thundering-herd pressure.
- `test:contract` uses a shorter fixed delay since contract failures are usually caused by ephemeral port/timing issues that resolve quickly.

## Package-Level Context

Each service/package has its own CLAUDE.md with domain-specific context:
- `services/users/CLAUDE.md` — User model, auth, env vars
- `services/agent/CLAUDE.md` — Agent sessions, SSE streaming, orchestration
- `services/reservations/CLAUDE.md` — Venues, tables, reservations
- `packages/rialto/CLAUDE.md` — Design system tokens, component APIs
