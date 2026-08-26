---
stage: idea
run: feature:visual-diffs-in-pr
date: 2026-08-25
assumptions: []
---

# Idea: Visual regression diffs inline in the pull request

> Source: `autorun-brief.md` in this directory (collected 2026-08-25, user
> request + orchestrator's first-hand session evidence). No live interview —
> every answer below comes from that brief, with each factual claim checked
> against the repo. Where a check disagreed with the brief, the measured
> value is used and the disagreement is called out.

## Problem

A reviewer opening a PR whose visual-regression job went red can see _that_
pixels changed, but not _which_ pixels or _how_. The diff PNGs exist —
Playwright writes `-expected` / `-actual` / `-diff` for every failed snapshot
into `apps/rialto-web/e2e/test-results/` — but they leave CI only as a zip
artifact (`rialto-web-visual-diffs`, uploaded by the `Upload diff artifacts on
failure` step in `.github/workflows/rialto-web-e2e.yml`, 14-day retention). To
actually look at them you leave the PR, find the run, download a
multi-megabyte archive, unpack it, and open images by hand.

So in practice nobody looks, and the red check gets classified by guesswork:
"probably just baseline drift" or "probably fine, merge it."

## Who has it

Two populations. The second is the one that makes this worth building.

- **Matt, reviewing PRs that touch shared UI.** Copes by downloading the
  artifact when he cares enough, and by assuming baseline drift when he
  doesn't.
- **The autonomous review layer** — `/implement-queue`'s `reviewer` gate,
  `/ci-monitor`, the auto-merge train. These cope _worse_. An agent reading
  `gh pr checks` sees a job name and a conclusion and nothing else; it cannot
  open a PNG inside a zip behind an authenticated artifact URL. A visual
  regression is currently invisible to the entire automated review layer.

## Why now

Two things changed this month.

1. **PR #4496** (merged 2026-08-23T23:43:34Z) tightened the tolerance from
   `maxDiffPixelRatio: 0.01` to `maxDiffPixels: 300` in
   `apps/rialto-web/playwright.config.ts` **without regenerating baselines**
   (its four changed files include no `e2e/screenshots/*.png`), and merged with
   its own `Visual Regression (rialto-web)` check red. It could: on #4496's head
   SHA `f5209a48`, `CI Gate` concluded `success` while
   `Visual Regression (rialto-web)` concluded `failure` — `CI Gate` is the only
   required check on `main`. Main then stayed red until **PR #4561** landed 24
   regenerated baselines at 2026-08-25T16:57:52Z. Nobody could see from the PR
   that the failure was baselines drifting rather than a real regression.
2. The repo has been leaning harder on autonomous review — and that is exactly
   the layer that cannot download a zip.

## Evidence

Labelled honestly: **first-hand and anecdotal — one operator, one session
(2026-08-25).** Not a survey, not a trend, no other users measured.

- To judge whether one diff in run `32873184619` was a real defect, the
  orchestrator had to download the `rialto-web-visual-diffs` artifact
  (measured 3,269,766 bytes), write a per-pixel `pngjs` comparator, and eyeball
  a diff PNG. The verdict — a "Confirm Action" overlay caught mid-fade in the
  baseline, not a regression — took several minutes and tooling no reviewer
  would build in the moment.
- The #4496 → red-main → #4561 arc above is the same failure told from the
  other end: the information needed to triage was produced by CI and then made
  too expensive to look at. Measured red window: ~41 hours (the brief's "two
  days" is the calendar span, not the elapsed one).
- **Counter-evidence worth recording:** the artifact upload _does_ work and the
  PNGs _are_ correct. This is a delivery problem, not a generation problem.

## Solution hunch

A hunch, recorded as one — the design belongs to the Architect stage.

On a failed visual run, push the diff PNGs to a dedicated orphan ref in this
repo, then post/update a **single sticky PR comment** embedding them by
`raw.githubusercontent.com` URL, grouped per changed snapshot as
baseline | actual | diff, with the pixel count against the budget. The repo is
public (verified: `visibility: PUBLIC`) and the baselines are already committed
in-repo, so this publishes nothing that isn't already public.

The user reviewed and selected this comment shape (2026-08-25):

```
## 🖼 Visual regression — 2 of 49 changed

### light-button-sizes  (1,204 px over 300 budget)
| baseline | actual | diff |
|---|---|---|
| <img src="raw.../base.png" width=250> | ... | ... |

<sub>47 unchanged · full artifact: rialto-web-visual-diffs</sub>
```

(The user's example read "2 of 24"; the suite is 49 snapshots — see Scope. The
shape is what was selected, not the count.)

Adjacent precedent, verified but not prescribed: `.github/workflows/ci.yml`,
`preview-deploy.yml`, and `mutation-testing.yml` already post PR comments from
CI, so the delivery mechanism is not novel in this repo.

## Success in one sentence

A reviewer — human or agent — can decide whether a visual failure is a real
regression or baseline drift **without leaving the pull request**.

## Scope

**In:** the `rialto-web` visual suite only — `apps/rialto-web/e2e/visual.spec.ts`,
run by the `visual` job in `.github/workflows/rialto-web-e2e.yml`.

> **Correction to the brief.** The brief sizes this suite at "24 baselines".
> Measured: the suite asserts **49** snapshots — 38 light sections, 9 dark
> sections, and 2 telemetry-HUD shots — and `apps/rialto-web/e2e/screenshots/`
> holds 49 committed PNGs. 24 is the number of baselines _regenerated by
> #4561_, not the size of the suite. Any cap-on-images decision downstream
> should be sized against 49, not 24.

**Out:** `packages/rialto/src/test/visual/visual.spec.ts` (the Storybook visual
suite driven by `.github/workflows/rialto-visual.yml`) — promotion to that
suite is _named, not taken_, the same precedent as the `e2e-behind-edge-csp`
run. Also out: the `functional` job's `rialto-web-functional-diffs` artifact,
any change to Playwright tolerances or baselines, and any change to what CI
considers pass/fail.

## Constraints carried in from the brief

- Stack is fixed: GitHub Actions + Playwright + Node 22, as the repo already
  uses. No new services, no new secrets.
- `CI Gate` is the only required check on `main`; nothing here may change which
  checks are required or how the gate concludes.
- The existing `rialto-web-visual-diffs` artifact upload stays — this is
  additive to it, not a replacement.
- Never `git add -A` (the PostToolUse prettier hook leaves ~171 files dirty);
  stage by explicit path.
- Repo conventions in `CLAUDE.md` / `.claude/rules/gotchas.md` apply, including:
  scripts get real unit tests, and a `run:` block whose exit code is the point
  opens with `set -o pipefail`.
- **Release authorization: none.** Ship prepares and stops.
- **No tracker interaction.** Work items stay as checkboxes in `breakdown.md`.

## Unknowns & risks

- **Unbounded orphan ref.** No pruning ⇒ a repo nobody wants to clone.
  Retention is a first-class design question, not a follow-up.
- **Comment spam.** Re-running or re-pushing must update one sticky comment,
  not append a new one each time.
- **Wall of images.** A run with many failures (the suite is 49 snapshots, and
  #4561 shows 24 drifting at once is a real occurrence) could post an
  unreadable comment; needs a cap plus an explicit "N more, see artifact" line.
- **Permissions.** The job needs `contents: write` and `pull-requests: write`.
  Verified: `rialto-web-e2e.yml` currently declares `permissions: contents: read`
  at workflow level with no job-level override, so it has neither today.
  The repo's documented anti-recursion trap applies — a `GITHUB_TOKEN`-authored
  push does not trigger downstream workflows — and this must not be allowed to
  interfere with `CI Gate`.
- **It may simply never fire.** The repo has a documented "shipped but never
  exercised" failure class. Verification must prove the comment appears on a
  real PR, not that the code exists.
- **The red check is advisory.** `Visual Regression (rialto-web)` is not a
  required check (#4496 merged with it red). Making the failure _visible_ does
  not make it _blocking_, and this run does not propose changing that — but a
  more legible red that still merges is a real way for this to deliver less
  than it looks like it does.

## Repo checks performed (read-only)

| Claim                                                  | Result                                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `visual` job + `Upload diff artifacts on failure` step | confirmed in `.github/workflows/rialto-web-e2e.yml`                                                                        |
| Diff PNGs land in the uploaded path                    | confirmed — `outputDir: "./e2e/test-results"` in `playwright.config.ts`, artifact path `apps/rialto-web/e2e/test-results/` |
| #4496 changed tolerance without regenerating baselines | confirmed via `gh pr diff 4496`                                                                                            |
| #4496 merged with the visual check red                 | confirmed — head `f5209a48`: `CI Gate` success, `Visual Regression (rialto-web)` failure                                   |
| #4561 = 24 regenerated baselines                       | confirmed — 24 files, all under `e2e/screenshots/`                                                                         |
| Artifact size on run `32873184619`                     | confirmed — 3,269,766 bytes                                                                                                |
| Repo is public                                         | confirmed                                                                                                                  |
| Suite size "24 baselines"                              | **contradicted** — 49 snapshots, 49 committed PNGs                                                                         |

## Next stage

**PRD.** Get there with the `prd` skill (or the router), writing
`docs/features/visual-diffs-in-pr/prd.md`. The PRD decides `ux:` on its own
evidence — the user-facing surface here is a rendered GitHub PR comment, not
application UI, and this brief deliberately does not pre-decide it.
