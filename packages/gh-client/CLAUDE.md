# @mbe/gh-client

Typed wrapper around GitHub. Centralizes exec-with-timeout handling, a REST
fallback for environments with no `gh` binary, and the coordination-label
state machine so automation scripts don't talk to GitHub directly.

## Reference

Source layout (`src/` file tree), a usage example and the list of consuming scripts: [docs/reference.md](./docs/reference.md). Read it before adding a module or a consumer.

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
4. `gh` present but GraphQL blocked (#6039, Claude Code Remote, where
   `gh pr list --json` answers `HTTP 403` from `api.github.com/graphql`) →
   that same call is retried through REST, and the runner latches to REST
   for the rest of its life (one-way, so no flapping). Only that exact
   403-on-GraphQL shape triggers it (`isGraphqlUnavailableError`); a 401 or
   any other exec failure is rethrown unchanged. If REST then has no token,
   `GhGraphqlUnavailableError` is thrown.

The REST path warns on stderr (once per flag, per runner) when a caller
passes a flag it does not emulate, instead of silently ignoring it.

Node has no synchronous `fetch`; `sync-http.ts` spawns the current Node
binary as a short-lived subprocess (request via stdin, response via stdout)
so `execFileSync` can block on it exactly like it already blocks on `gh` —
no new dependency, no async leaking into the public API.

The REST mappers return a superset of gh's `--json <fields>` output (not a
field-projected subset) — extra fields are harmless since every caller reads
named fields it asked for. `pr.list`/`pr.view` pay one extra REST call per PR
only when `commits`/`additions`/`deletions`/`reviews` are actually requested
(`commits`/`additions`/`deletions` are needed for `queueEfficiency`'s
first-pass-success-rate calculation — see `scripts/sensors-registry.mjs`).

Commits and reviews are **shaped**, not passed through raw (#4706). REST calls
a commit's fields `sha` / `commit.message` / `commit.author.name`, while every
consumer in this repo reads GraphQL's `oid` / `messageHeadline` +
`messageBody` / `authors[].login` / `authoredDate` — so `mapPrCommit` and
`mapPrReview` translate. Two rules the mappers hold to, because the bug this
fixed returned confident wrong answers rather than erroring:

- **A missing `login` is represented as missing**, never synthesized from the
  commit's name or email. REST resolves `author` to `null` whenever the commit
  email maps to no GitHub account, and a fabricated login is indistinguishable
  from a real one downstream.
- **`messageHeadline` is not truncated.** GitHub's GraphQL cuts it at 69
  characters and pushes the remainder into `messageBody` behind an ellipsis
  (measured on PR #3250); that quirk is lossy and its exact rule is not
  documented, so this mapper splits on the first blank line and keeps the
  subject intact.

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
