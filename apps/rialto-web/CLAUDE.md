# CLAUDE.md — apps/rialto-web

Rialto design system showcase site. Deployed at `/rialto/` via Cloudflare Worker `mattbutlerengineering-rialto-web`.

## Domain Context

Showcase site for `@mattbutlerengineering/rialto` components. Not a production data app — showcase-tier risk posture.
Build copies `registry.json` from `packages/rialto/` to `public/registry.json`.

## Visual Regression Workflow

```bash
# Run from monorepo root
pnpm test:visual

# ~50 specs in apps/rialto-web/e2e/visual.spec.ts
# Screenshots stored in apps/rialto-web/e2e/screenshots/
```

**Never claim a UI change works without running `pnpm test:visual` and reviewing the diff PNGs.**

## Component Reference

```typescript
// Always import from the published package, never from ../packages/rialto/src
import { Button, Card, Badge } from "@mattbutlerengineering/rialto";
```

The showcase exists to consume the published surface.

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

## Context Budget Guidance

Prefer `apps/rialto-web/llms.txt` for component-level lookups instead of reading source.

## Model Tiering Note

Showcase changes are low-risk — Haiku/Sonnet appropriate, no Opus needed.

## Idempotent Workflows Note

Rebuilding/redeploying is safe; no state to preserve.

## Feedback Loops

Visual regression diffs ARE the feedback loop. New components require a new visual spec in `e2e/visual.spec.ts`.

## Evidence-Based Rules

1. **Visual regression IS verification** — Observed 2026-04-27: agent claimed UI fix worked, but didn't run `pnpm test:visual`, screenshot showed broken layout. Rule: always attach screenshot diff to UI claims.

## Root-only scripts

The following commands must be run from the monorepo root, **not** inside `apps/rialto-web/`:

```bash
pnpm test:visual   # Visual regression (Playwright)
```
