# @mbe/gh-client

Typed wrapper around the `gh` CLI. Centralizes exec-with-timeout handling and
the coordination-label state machine so automation scripts don't shell out
to `gh` directly.

## Structure

```
src/
├── index.ts             # Barrel export
├── client.ts            # createGhClient — { issue, pr, label, workflow } facets
├── exec-runner.ts        # createExecRunner — execFileSync wrapper, injectable for tests
└── label-machine.ts      # COORDINATION_LABELS + markInProgress/markHasPr/markFailed/markSkip/markReady
```

## Usage

```typescript
import { createGhClient, markInProgress } from "@mbe/gh-client";

const gh = createGhClient(); // runner defaults to execFileSync, 15s timeout
const issues = gh.issue.list(["--label", "ready", "--json", "number,title"]);
gh.label.apply(markInProgress(issueNumber));
```

## Consumers

Root automation scripts under `scripts/` (declared dep in `scripts/package.json`):
`sensor-report.mjs`, `auto-retry-stale.mjs`, `chaos-agent.mjs`, `verify-fixes.mjs`,
`revert-rca.mjs`, `collect-ai-issue-feedback.mjs`, `process-metrics.mjs` — the
`implement-queue`/`ci-monitor`/`learning-loop` skills' backing scripts. Not
consumed by any app or service.

## Gotchas

- `createExecRunner`'s `runner` option exists purely for test injection — production callers should never pass one
- `label.apply()` is a no-op (skips the `gh` call entirely) when a transition's `add`/`remove` arrays are both empty
- Label transitions are pure data (`LabelTransition`); `client.ts` is the only place that actually shells out for them

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Vitest unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
