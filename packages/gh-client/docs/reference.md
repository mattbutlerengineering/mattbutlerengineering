# gh-client reference

Source layout, a usage example and the consumer list for `@mbe/gh-client`, moved out of [CLAUDE.md](../CLAUDE.md) so they don't load into context every time a gh-client file is read. The source of truth is the code: `src/index.ts` for the exports and `scripts/package.json` for the consumers.

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
├── rest-search-filters.ts                  # parseSearchFilters + repo-scoped list (Search API is blocked in CCR, #6445)
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

## Consumers

Root automation scripts under `scripts/` (declared dep in `scripts/package.json`):
`sensor-report.mjs`, `auto-retry-stale.mjs`, `chaos-agent.mjs`, `verify-fixes.mjs`,
`revert-rca.mjs`, `collect-ai-issue-feedback.mjs`, `process-metrics.mjs` — the
`implement-queue`/`ci-monitor`/`learning-loop` skills' backing scripts. Not
consumed by any app or service.
