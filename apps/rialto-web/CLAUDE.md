# CLAUDE.md — apps/rialto-web

Rialto design system showcase site. Deployed at `/rialto/` via Cloudflare Worker `mattbutlerengineering-rialto-web`.

## Domain Context

Showcase site for `@mattbutlerengineering/rialto` components. Not a production data app — showcase-tier risk posture.

## Visual Regression Workflow

```bash
# Run from monorepo root
pnpm test:visual

# ~50 specs in apps/rialto-web/e2e/visual.spec.ts
# Screenshots stored in apps/rialto-web/e2e/screenshots/
```

**Never claim a UI change works without running `pnpm test:visual` and reviewing the diff PNGs.**

### Reading a failed visual run on a pull request

When the `visual` job of `.github/workflows/rialto-web-e2e.yml` fails on a pull
request, you no longer have to download the `rialto-web-visual-diffs` artifact to
see what changed. The `publish-visual-diffs` job posts a single sticky comment on
that PR carrying, for each changed snapshot, its name and its measured pixel
difference against the `maxDiffPixels` budget, with the baseline / actual / diff
PNGs embedded inline. The comment is readable as plain text — so
`gh pr view <N> --comments` gives you the snapshot names and pixel counts without
fetching an image — and the image URLs are unauthenticated
`raw.githubusercontent.com` links, so they can be fetched directly. Re-running
the job rewrites that one comment; a later passing run retracts it.

Two limits worth knowing. The comment shows at most six snapshots as images and
names the rest in an overflow list, so the artifact is still the full record. And
the workflow's `paths:` filter means it only runs when the pull request's
cumulative diff touches `apps/rialto-web/**`, `packages/rialto/src/**` or
`infrastructure/worker/**` — a PR that backs out its entire `apps/rialto-web/**`
change stops triggering the workflow, so a failure comment from an earlier push
can be left standing. Delete it by hand in that case.

See `docs/features/visual-diffs-in-pr/` for the design.

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
