# @mbe/gh-client

Typed wrapper around GitHub. Centralizes exec-with-timeout handling, a REST
fallback for environments with no `gh` binary, and the coordination-label
state machine so automation scripts don't talk to GitHub directly.

## Structure

```
src/
├── index.ts               # Barrel export
├── client.ts               # createGhClient — { issue, pr, label, workflow } facets
├── transport.ts             # createTransportRunner — probes gh, picks exec or REST
├── exec-runner.ts           # createExecRunner — execFileSync("gh", ...) wrapper
├── gh-probe.ts               # createGhProbe — memoized "is gh on PATH" check
├── label-machine.ts          # COORDINATION_LABELS + markInProgress/markHasPr/markFailed/markSkip/markReady
├── rest-runner.ts             # createRestRunner — dispatches (cmd,args) to the REST ops below
├── rest-args.ts                 # gh-CLI-arg parsing, token resolution, MissingGithubTokenError
├── rest-http.ts                  # apiRequest — auth headers + error envelope over sync-http
├── rest-paginate.ts               # fetchAllPages — pages past GitHub's 100-per-page cap
├── rest-search.ts                  # buildSearchQuery — gh's --search flag via the Search API
├── rest-mappers.ts                  # REST payload → gh-CLI camelCase field-name mapping
├── rest-issue-ops.ts                 # issue list/view/create/comment/reopen/close/edit
├── rest-pr-ops.ts                     # pr list/view/create
├── rest-label-run-ops.ts               # label list, workflow.runs (`gh run list`)
├── sync-http.ts                         # defaultSyncHttp — subprocess bridge making fetch synchronous
└── git-branch.ts                         # currentBranch — pr.create's implicit --head default
```

## Usage

```typescript
import { createGhClient, markInProgress } from "@mbe/gh-client";

const gh = createGhClient(); // runner defaults to execFileSync, 15s timeout
const issues = gh.issue.list(["--label", "ready", "--json", "number,title"]);
gh.label.apply(markInProgress(issueNumber));
```

## Transport (#3689)

Every facet is synchronous, and stays that way regardless of transport —
callers never need to know or care which one they got:

1. `createTransportRunner` probes `gh --version` once per client (memoized
   process-wide via `probeGh` unless a caller injects its own `probe`).
2. `gh` present → delegates to the untouched `createExecRunner` path.
   Behaviour is byte-identical to before #3689.
3. `gh` absent → `createRestRunner` translates the same `gh`-CLI-shaped
   `(cmd, args)` call into GitHub REST (or Search) API calls, authenticated
   with `GITHUB_TOKEN` ?? `GH_TOKEN`. Missing both throws
   `MissingGithubTokenError` — naming the credential, not `spawn gh ENOENT`.

Node has no synchronous `fetch`; `sync-http.ts` spawns the current Node
binary as a short-lived subprocess (request via stdin, response via stdout)
so `execFileSync` can block on it exactly like it already blocks on `gh` —
no new dependency, no async leaking into the public API.

The REST mappers return a superset of gh's `--json <fields>` output (not a
field-projected subset) — extra fields are harmless since every caller reads
named fields it asked for. `pr.list`/`pr.view` pay one extra REST call per PR
only when `commits`/`additions`/`deletions` are actually requested (needed
for `queueEfficiency`'s first-pass-success-rate calculation — see
`scripts/sensors-registry.mjs`).

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
- The REST fallback resolves `owner/repo` from `GITHUB_REPOSITORY` (GitHub Actions convention) or, failing that, `git remote get-url origin` — see `repo-resolver.ts`
- `--jq` support in the REST path is intentionally narrow: only the `--json comments --jq .comments` shape `scripts/process-metrics.mjs` actually uses is handled, not a general jq interpreter

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Vitest unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
