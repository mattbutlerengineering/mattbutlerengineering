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

## Package-Level Context

Each service/package has its own CLAUDE.md with domain-specific context:
- `services/users/CLAUDE.md` — User model, auth, env vars
- `services/agent/CLAUDE.md` — Agent sessions, SSE streaming, orchestration
- `services/reservations/CLAUDE.md` — Venues, tables, reservations
- `packages/rialto/CLAUDE.md` — Design system tokens, component APIs
