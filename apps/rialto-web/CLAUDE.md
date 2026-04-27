# CLAUDE.md - Rialto Web Development Guidelines

> App-specific mandates for Claude Code working on `apps/rialto-web`.

## Core reference
- **Root Context:** [CLAUDE.md](../../CLAUDE.md)
- **Design System:** [packages/rialto/CLAUDE.md](../../packages/rialto/CLAUDE.md)
- **Architecture:** [AGENTS.md](../../AGENTS.md)

## App Info
- **Path:** `apps/rialto-web`
- **URL:** `/rialto` on mattbutlerengineering.com
- **Tech:** React 19 + Vite + Rialto + Framer Motion

## Commands
```bash
pnpm dev            # Dev server (port 5173)
pnpm build         # Production build
pnpm test:e2e     # Playwright E2E tests
pnpm test:visual   # Visual regression tests
```

## Visual Testing
Run visual tests before marking UI work complete:
```bash
pnpm test:visual   # from monorepo root
```

## Workflow
1. Check `llms.txt` for component patterns
2. Use Rialto tokens (`var(--rialto-*)`)
3. Test responsive at mobile/tablet/desktop
4. Run visual regression check before PR