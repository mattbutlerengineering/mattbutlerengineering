# AGENTS.md — apps/rialto-web

Rialto design system showcase site. Deployed at `/rialto/` via Cloudflare Worker `mattbutlerengineering-rialto-web`.

## Service Purpose

This is a **showcase site**, not a product. No business logic, no user data, no authentication. P3 risk tier.

## Component Reference

```typescript
// Always import from the published package, never from local source
import { Button, Card, Badge } from "@mattbutlerengineering/rialto";
```

The showcase exists to consume the published surface of `@mattbutlerengineering/rialto`.

## Visual Regression

```bash
# Run from monorepo root
pnpm test:visual

# ~50 specs in apps/rialto-web/e2e/visual.spec.ts
# Screenshots stored in apps/rialto-web/e2e/screenshots/
```

**Never claim a UI change works without running `pnpm test:visual` and reviewing the diff PNGs.**

## Adding New Components

1. Add component to `packages/rialto/`
2. Add showcase page in `apps/rialto-web/src/pages/`
3. Add visual spec to `apps/rialto-web/e2e/visual.spec.ts`
4. Run `pnpm test:visual` and verify diffs

## Build & Deploy Commands

```bash
pnpm --dir apps/rialto-web dev              # Vite dev server
pnpm --dir apps/rialto-web build           # Vite build
pnpm --dir apps/rialto-web preview      # Preview build locally
pnpm --dir apps/rialto-web lint           # ESLint
pnpm --dir apps/rialto-web typecheck      # TypeScript type check
pnpm --dir apps/rialto-web test:a11y      # a11y tests (Playwright + axe-core)

# Deploy
pnpm dlx wrangler@latest deploy --config apps/rialto-web/wrangler.toml
```

## When NOT to Make Changes Here

- Business logic belongs in consumer apps (hospitality, gen) — this site is purely demonstration
- Component logic belongs in `packages/rialto/` — this site only showcases
- Never modify `packages/rialto/src/` from this directory

## Model Tiering

Showcase changes are low-risk — Haiku/Sonnet appropriate, no Opus needed.

## Context Budget

Prefer `apps/rialto-web/llms.txt` for component-level lookups instead of reading source.
