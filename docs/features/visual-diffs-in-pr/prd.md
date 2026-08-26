---
stage: prd
run: feature:visual-diffs-in-pr
date: 2026-08-25
ux: not-applicable
ux-reason: No application UI, component, or design-system surface — the sole presentation is one GitHub PR comment whose layout the user already selected at idea stage.
assumptions:
  - "ux: not-applicable was determined by this PRD against the stated criterion (does this work have a user-facing surface?), not supplied by the user — autorun-brief.md deliberately left the call to this stage."
  - "Stale-comment behaviour (SC-5: a passing re-run must not leave a failure comment standing) is stated in neither autorun-brief.md nor idea.md. Derived here from the run's own success sentence, on the grounds that a comment asserting a failure that no longer exists misleads both actors in exactly the way this feature is meant to prevent."
---

# PRD: Visual regression diffs inline in the pull request

> Source: `autorun-brief.md` and `idea.md` in this directory. No live
> interview — every answer below comes from those two artifacts. Evidence is
> carried forward at the strength `idea.md` recorded it: **first-hand and
> anecdotal, one operator, one session (2026-08-25)**. Nothing here upgrades it.

## Problem statement

When `Visual Regression (rialto-web)` goes red on a pull request, the
information needed to judge the failure exists but is unreachable from the PR.
Playwright writes `-expected` / `-actual` / `-diff` PNGs; the workflow uploads
them as the `rialto-web-visual-diffs` zip (14-day retention). Looking at them
means leaving the PR, finding the run, downloading a multi-megabyte archive
(measured 3,269,766 bytes on run `32873184619`), unpacking it, and opening
images by hand. So in practice nobody does, and the red check gets classified
by guesswork.

The cost is not hypothetical: #4496 tightened the tolerance without
regenerating baselines and merged with its own visual check red — `CI Gate`,
the only required check, was green — leaving `main` red for ~41 hours until
#4561 landed 24 regenerated baselines. Nothing on #4496 showed that the
failure was drift rather than a regression.

The second population cannot cope at all. An agent in the autonomous review
layer reads `gh pr checks --json name,state,conclusion`; it sees a job name and
a conclusion. It cannot open a PNG inside a zip behind an authenticated
artifact URL. A visual regression is currently invisible to that entire layer.

## Solution

When the `visual` job fails on a pull request, that PR gains a single sticky
comment which states how many of the suite's snapshots changed, and for each
changed snapshot gives its name, its measured pixel difference against the
configured budget, and baseline / actual / diff images embedded inline. A human
scrolls the PR and looks. An agent reads the same comment as text and gets the
snapshot names and pixel counts without fetching a single image. Re-running the
job rewrites that one comment rather than adding another. The existing artifact
upload is untouched and is still named in the comment as the full record.

Nothing about what CI considers pass or fail changes.

## Actors

- **Matt, the human reviewer** — the repo's reviewer for PRs touching shared
  UI. Today he downloads the artifact when he cares enough, and assumes
  baseline drift when he doesn't.
- **The autonomous review layer** — `/implement-queue`'s `reviewer` gate,
  `/ci-monitor`, and the auto-merge train. Agents that read PR state through
  `gh pr checks` / `gh pr view` and have no way to open an authenticated
  artifact zip. This is the population that makes the feature worth building.

## User stories

1. As **Matt**, I want the changed snapshots' baseline, actual and diff images
   embedded in the pull request itself, so that I can tell a real regression
   from baseline drift without leaving the PR or downloading anything.
2. As **Matt**, I want each changed snapshot labelled with its name and its
   pixel difference against the budget, so that I can see at a glance whether
   a failure is 3 pixels over or 3,000.
3. As **Matt**, I want one comment that updates on re-run, so that a PR I
   push to five times does not accumulate five walls of images.
4. As a member of **the autonomous review layer**, I want the visual failure
   described in readable comment text — snapshot names, pixel counts, changed
   vs unchanged totals — so that I can factor a visual regression into a
   review or merge decision at all, instead of seeing only a job conclusion.
5. As a member of **the autonomous review layer**, I want the embedded image
   URLs to be fetchable without credentials, so that a vision-capable agent
   can look at the pixels rather than only counting them.
6. As **Matt**, I want a comment that stays legible when many snapshots change
   at once — #4561 shows 24 changing in one go is real, against a suite of 49
   — so that the comment does not become the thing nobody reads.

## Success criteria

- [ ] **SC-1 (must be demonstrated on a real pull request, not in tests).** On
      a pull request whose `Visual Regression (rialto-web)` job fails, the
      comment is present on that PR after the run completes. Evidence is a PR
      number and the rendered comment — not passing tests, not merged code.
- [ ] **SC-2.** The comment text alone — as returned by
      `gh pr view <N> --comments`, with no image fetched — carries: the count
      of changed snapshots out of the suite total, and per changed snapshot its
      name and measured pixel difference against the budget.
- [ ] **SC-3.** Every embedded image URL in that comment returns HTTP 200 with
      an image content type when requested with no credentials.
- [ ] **SC-4.** After the job is re-run on the same PR, the PR carries exactly
      one such comment, and its contents reflect the latest run.
- [ ] **SC-5.** When the visual job passes on a PR that previously failed, no
      comment claiming a failure is left standing.
- [ ] **SC-6.** When more snapshots change than the display cap, the comment
      shows at most the cap and states explicitly how many more there are and
      where the full set lives (the `rialto-web-visual-diffs` artifact).
- [ ] **SC-7.** `CI Gate` concludes on the PR exactly as it would without this
      feature, the set of required checks on `main` is unchanged, and the
      `visual` job's own pass/fail verdict is unchanged.
- [ ] **SC-8.** The `rialto-web-visual-diffs` artifact still uploads on
      failure with its existing name and contents.

## Constraints (given — not decisions this run makes)

Fixed by the user at brief time, or by the repo. Recorded here so downstream
stages treat them as input, not as open design space.

- **Delivery mechanism is chosen:** diff PNGs pushed to a dedicated orphan ref
  in this repo; a single sticky PR comment embedding them by
  `raw.githubusercontent.com` URL. Chosen over Cloudflare R2 (credentials, more
  moving parts) and over a no-images summary table.
- **Comment shape is chosen** — the skeleton the user reviewed and selected:
  a heading with changed-of-total, then per snapshot a `### name (N px over
M budget)` heading and a three-column baseline | actual | diff table, then a
  `<sub>` footer naming the unchanged count and the artifact.
- **Scope is rialto-web only:** `apps/rialto-web/e2e/visual.spec.ts`, run by
  the `visual` job in `.github/workflows/rialto-web-e2e.yml`. The suite is
  **49** snapshots (`idea.md` corrected the brief's "24", which was #4561's
  regenerated count, not the suite size). Size any cap against 49.
- **Stack is fixed:** GitHub Actions + Playwright + Node 22. No new services,
  no new secrets.
- **The repo is public** and the baselines are already committed in-repo, so
  this publishes nothing that is not already public.
- The job will need `contents: write` and `pull-requests: write`;
  `rialto-web-e2e.yml` declares `permissions: contents: read` today with no
  job-level override. The repo's documented `GITHUB_TOKEN` anti-recursion trap
  applies to any push this makes and must not disturb `CI Gate`.
- Repo conventions apply: scripts carry real unit tests; a `run:` block whose
  exit code is the point opens with `set -o pipefail`; never `git add -A`.
- **No tracker interaction** anywhere in this run. **No release
  authorization** — Ship prepares and stops.

## Out of scope

- **The Storybook visual suite** (`packages/rialto/src/test/visual/visual.spec.ts`,
  driven by `rialto-visual.yml`). Promotion to it is _named, not taken_ — the
  same precedent as the `e2e-behind-edge-csp` run.
- The `functional` job and its `rialto-web-functional-diffs` artifact.
- Any change to Playwright tolerances, to committed baselines, or to what CI
  considers pass/fail.
- **Making the visual check blocking.** `Visual Regression (rialto-web)` is
  advisory today; #4496 merged with it red. This run makes the failure legible,
  not blocking. That is a real ceiling on what this delivers and it is accepted
  deliberately, not overlooked.
- Replacing the artifact upload. This is additive to it.
- Any automatic baseline regeneration, approve-this-diff button, or
  accept-new-baseline flow.

## Open questions

Design questions, parked for **Architect** — this PRD deliberately does not
answer them.

- **Retention on the orphan ref.** `idea.md` calls unbounded growth a
  first-class design question. What prunes it, when, and by what rule?
  Answerable by: Architect.
- **The display cap number**, and the ordering of snapshots within the comment
  (largest diff first? spec order?). The requirement that a cap and an overflow
  line exist is fixed above (SC-6); the values are not. Answerable by:
  Architect, sized against 49.
- **Fork pull requests.** A `pull_request` event from a fork gets a read-only
  token, so neither `contents: write` nor `pull-requests: write` is grantable.
  Raised here because neither the brief nor `idea.md` mentions it. Does the
  feature degrade silently on forks, or is the repo's single-author reality
  enough to declare forks out of scope? Answerable by: Architect (and Matt, if
  it turns into a scope call).
- **Push-to-main runs have no PR to comment on.** The workflow triggers on
  both `push` to `main` and `pull_request`; the no-PR path must no-op rather
  than fail the job. Mechanism is Architect's.
- **Image sizing and the legibility budget** — the selected shape shows
  `width=250`; whether that is enough to judge a 300-pixel diff is an
  empirical question best settled by looking at a real rendered comment during
  Verify.

## Next stage

`ux: not-applicable`, so the UX Design stage is skipped and the next stage is
**Architect**, writing `docs/features/visual-diffs-in-pr/architecture.md`.
Architect should echo the recorded `ux-reason:` in its own frontmatter so the
skip is never ambiguous downstream.
