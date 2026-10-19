# @mbe/ui-quality-capture

The shared half of every app's ui-quality capture spec: `capturePage(page, route, opts)`
visits one planned route and returns its `manifest.jsonl` row (screenshots, axe result,
console/page errors, failed requests, links, blank-render measure). Playwright, e2e only.

It is a workspace package (not app code) because dependency-cruiser's `apps-not-imported`
rule keeps capture inside each app's e2e boundary, so the shared logic cannot live in an app.

## Structure

```
src/
├── ui-quality-capture.ts          # capturePage, revealLazyContent, screenshotName, ... (package entry `.`)
└── __tests__/ui-quality-capture.test.ts
```

## Consumers

Import only from e2e code: `import { capturePage } from "@mbe/ui-quality-capture";`

- `apps/hospitality/e2e/ui-quality.capture.ts`
- `apps/marketing/e2e/ui-quality.capture.ts`, `apps/marketing/e2e/visual.spec.ts`
- `apps/rialto-web/e2e/ui-quality.capture.ts`

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Vitest unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
