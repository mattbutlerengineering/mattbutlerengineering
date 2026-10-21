# ai-issue-feedback: detecting the merged PR that closed an issue

Investigation for #7196 (tracking #7202, proposal #7062). No production code.

## Problem

`scripts/collect-ai-issue-feedback.mjs` sets `linkedPrs: []` on every issue
because `gh issue list --json` (GraphQL) exposes no linked PRs. The
`accepted` branch of `classifyIssue()` can therefore never fire.

## Chosen REST call

`GET /repos/{owner}/{repo}/issues/{n}/timeline?per_page=100`

Plain REST, so it works from Claude Code Remote sessions (GraphQL answers
403 there) and from GitHub Actions. Reachable through `@mbe/gh-client`'s
`api` passthrough with `gh api`.

Fields used from each `cross-referenced` event:

| Field                                 | Use                                     |
| ------------------------------------- | --------------------------------------- |
| `source.type`                         | must be `issue` (PRs surface as issues) |
| `source.issue.number`                 | linked PR number                        |
| `source.issue.pull_request.merged_at` | non-null means the PR merged            |
| `source.issue.body`                   | closing-keyword check, see below        |

## Merged PR vs. mere mention

A cross-reference only says the PR text mentions the issue. A PR is counted
as a linked PR for issue `N` only when **both** hold:

1. `source.issue.pull_request.merged_at` is non-null, and
2. `source.issue.body` matches
   `/\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#N\b/i`.

Measured on #7171: its one merged cross-reference (#7173) matches both and is
the PR that closed it. #7176, closed by #7181, shows the same shape. Issues
closed by hand with no PR (for example `not_planned`) have no qualifying
event and keep the `stateReason` fallback.

The `closed` event's `commit_id` is not usable: every issue sampled
(#7171, #7176, #7179, #7184) had it empty, because these issues are closed
by the REST merge flow, not by a commit reference.

Adapter output shape: `[{ number, state: "MERGED" }]`, matching what
`classifyIssue()` already reads (`pr.state === "MERGED"`). Closed-unmerged
PRs are omitted.

## Call budget

- One request per closed issue, `per_page=100`. The timeline of an issue
  with more than 100 events needs a second page; the adapter follows pages
  until a merged closing PR is found or events run out.
- Window: up to 200 issues per run, so about 200 requests, rarely more.
- Core REST limit is 5000/hour for a token (measured 15000 in this
  session). One run uses at most about 4% of the smaller figure.
- Concurrency: cap at 5 in flight. On 403/429 the adapter must degrade to
  `[]` for the remaining issues and count the failure, never throw.

## Follow-ups

#7197 (`classifyIssue` tests), #7198 (adapter), #7199 (wire-in), #7200
(before/after table), #7201 (guard test).
