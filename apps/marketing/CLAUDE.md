# Marketing Site

Public marketing site for mattbutlerengineering.com. React + Vite SPA. Port **3000**, deployed at root `/`.

## Reference

Page/route inventory, key components and the E2E spec inventory: [docs/reference.md](./docs/reference.md).

## Pages

Routes: `/`, `/status`, `/weekly`, `/metrics`, `/shipped`, `/shipped/:slug`, `*` (404). Full table: [docs/reference.md](./docs/reference.md#pages).

Fallback redirects: `/rialto/*` and `/hospitality/*` redirect to their respective apps (safety net for edge router failures).

All pages are `React.lazy()` with `Suspense` fallback.

## Key Components

All UI primitives come from `@mattbutlerengineering/rialto` (`Footer`, `GlobalNav`, `Heading`, `Text`, `Button`, `Card`, `Badge`, `Stack`, etc.).

## Patterns

- **Rialto-only UI** — no raw `<button>`, `<input>`, `<select>`. All colors via `var(--rialto-*)` tokens.
- **PWA** — service worker with auto-update, Google Fonts cached 1 year, HTML always network-first.
- **API proxy (dev only)** — `/api/*` proxies to `http://localhost:3001`.
- **Module alias** — `@` maps to `./src/`.
- **Sentry** — error boundary + source map upload on build.

## Build Size Limits

Enforced by `size-limit`:

- JS: 750 kB max
- CSS: 50 kB max

## Environment Variables

| Variable            | Required   | Description                       |
| ------------------- | ---------- | --------------------------------- |
| `VITE_SENTRY_DSN`   | No         | Sentry DSN for error tracking     |
| `SENTRY_ORG`        | No (build) | Sentry org for source map upload  |
| `SENTRY_PROJECT`    | No (build) | Sentry project name               |
| `SENTRY_AUTH_TOKEN` | No (build) | Sentry auth for source map upload |

## Commands

```bash
pnpm dev              # Dev server on :3000
pnpm build            # TypeScript check + Vite build
pnpm preview          # Preview production build
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check
pnpm test             # Vitest unit tests
pnpm test:coverage    # Coverage report
pnpm test:a11y        # Playwright + axe-core a11y tests
pnpm test:e2e         # Full Playwright e2e/ suite (run in CI by Marketing E2E)
pnpm size             # Check bundle size limits

# Deploy
pnpm dlx wrangler@latest deploy
```

## E2E Tests

Playwright tests in `e2e/`, run in CI by the `Marketing E2E` job (`.github/workflows/e2e.yml`, advisory — see issue #3886). Spec inventory: [docs/reference.md](./docs/reference.md#e2e-tests).
