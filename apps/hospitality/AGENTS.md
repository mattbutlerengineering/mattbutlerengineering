# AGENTS.md - Cross-Tool Agent Rules for Hospitality App

> Tool-agnostic agent rules. Applies to all AI coding agents (Claude, Gemini, Cursor, etc.).

## Critical Constraints

All agents working on this app MUST follow these rules:

1. **All UI uses Rialto components** — never raw `<button>`, `<input>`, `<select>`. Import from `@mattbutlerengineering/rialto`.

2. **All colors use `var(--rialto-*)` tokens** — no hardcoded hex colors. The app is fully dark-mode compatible.

3. **All API calls use `@mbe/api-client`** with `getAccessToken` — never raw `fetch`. The auth package handles token injection.

4. **SSE callbacks use refs** — inline callbacks cause reconnection on every render. Use `useCallback` with refs.

5. **State must be immutable** — always use spread/map/filter. Never mutate state directly.

6. **ES module imports require explicit `.js` extension** — e.g., `import { foo } from './utils.js'`.

## App-Specific Commands

```bash
pnpm dev              # Dev server on port 3002
pnpm build           # Production build
pnpm test            # Unit tests (Vitest)
pnpm test:e2e        # E2E tests (Playwright)
pnpm lint            # ESLint
pnpm typecheck       # TypeScript
```

## Context Files

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](./CLAUDE.md) | Full developer context, components, patterns |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Data flow, API surface, SSE patterns |
| [docs/USER-FLOWS.md](./docs/USER-FLOWS.md) | 10 critical user flows |
| [docs/E2E-TEST-PLAN.md](./docs/E2E-TEST-PLAN.md) | Playwright test specs |

## Technology Stack

- React 18 + Vite
- Rialto design system
- Konva for floor plan editor
- @mbe/api-client for API calls
- @mbe/auth for Auth0 authentication
- Playwright for E2E tests
- Vitest for unit tests