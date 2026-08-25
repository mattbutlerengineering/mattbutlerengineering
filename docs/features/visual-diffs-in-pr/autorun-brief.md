# Autorun brief — visual-diffs-in-pr

Collected 2026-08-25. Source: user request + orchestrator's first-hand
session evidence. This brief is not a pipeline artifact — it never counts
toward orientation or active-run discovery.

## Request (verbatim)

> can we update our prs to include images of the visual regressions so that
> they are part of the review?

## Run scale

Feature run. Slug: `visual-diffs-in-pr`. Artifacts at
`docs/features/visual-diffs-in-pr/`.

## Idea-stage inputs

**Problem, from the sufferer's view.** A reviewer opening a PR whose visual
regression job went red can see _that_ pixels changed but not _which_ pixels
or _how_. The diff PNGs exist — Playwright writes `-expected`/`-actual`/`-diff`
for every failed snapshot — but they leave CI only as a zip artifact. To
actually look at them you leave the PR, find the run, download a multi-megabyte
archive, unpack it, and open images by hand. So in practice nobody looks, and
the red check gets classified by guesswork: "probably just a baseline drift"
or "probably fine, merge it."

**Who has it, and how they cope today.** Two populations, and the second is
the one that makes this worth building:

- Matt, reviewing PRs that touch shared UI. Copes by downloading the artifact
  when he cares enough, and by assuming baseline drift when he doesn't.
- The autonomous agents that review and merge PRs in this repo
  (`/implement-queue`'s `reviewer` gate, `/ci-monitor`, the auto-merge train).
  They cope _worse_: an agent reading `gh pr checks` sees a job name and a
  conclusion and nothing else. It cannot open a PNG that lives inside a zip
  behind an authenticated artifact URL. A visual regression is currently
  invisible to the entire automated review layer.

**Why now.** Two things changed this month. (1) #4496 tightened the tolerance
from `maxDiffPixelRatio: 0.01` to `maxDiffPixels: 300` without regenerating
baselines, and merged with its own `rialto-web-e2e` red — leaving main red for
two days until PR #4561 landed 24 regenerated baselines. Nobody could see from
the PR that the failure was 24 baselines drifting rather than a real
regression. (2) The repo has been leaning harder on autonomous review, and
that layer is exactly the one that cannot download a zip.

**Evidence the problem is real.** First-hand and anecdotal — one operator, one
session (2026-08-25), labelled as such, not a survey:

- To judge whether one diff in run 32873184619 was a real defect, the
  orchestrator had to download the 3.2 MB `rialto-web-visual-diffs` artifact,
  write a per-pixel `pngjs` comparator, and eyeball a diff PNG. The verdict —
  a "Confirm Action" overlay caught mid-fade in the baseline, not a
  regression — took several minutes and tooling that no reviewer would build
  in the moment.
- The #4496 → two-day-red-main → #4561 arc above is the same failure told
  from the other end: the information needed to triage was produced by CI and
  then made too expensive to look at.
- Counter-evidence worth recording: the artifact upload _does_ work and the
  PNGs _are_ correct. This is a delivery problem, not a generation problem.

**Rough shape of a solution (hunch, not design).** On a failed visual run,
push the diff PNGs to a dedicated orphan ref in this repo, then post/update a
single sticky PR comment that embeds them by `raw.githubusercontent.com` URL,
grouped per changed snapshot as baseline | actual | diff, with the pixel count
against the budget. The repo is public and the baselines are already committed
in-repo, so this publishes nothing that isn't already public.

**Success, in one sentence.** A reviewer — human or agent — can decide whether
a visual failure is a real regression or baseline drift without leaving the
pull request.

**Biggest unknowns / how this dies.**

- The orphan ref grows without bound. No pruning ⇒ a repo nobody wants to
  clone. Retention is a first-class design question, not a follow-up.
- Comment spam: re-running or re-pushing must update one sticky comment, not
  append a new one each time.
- A run with many failures could post an unreadable wall of images; needs a
  cap with an explicit "N more, see artifact" line.
- Permissions: the job needs `contents: write` and `pull-requests: write`.
  Note the repo's own documented trap — a `GITHUB_TOKEN`-authored push does
  not trigger downstream workflows (anti-recursion); this must not be allowed
  to interfere with `CI Gate`.
- It may simply not fire: the repo has a documented "shipped but never
  exercised" failure class. Verification must prove the comment appears on a
  real PR, not that the code exists.

## Scope

**In:** the `rialto-web` visual suite only —
`apps/rialto-web/e2e/visual.spec.ts`, run by the `visual` job in
`.github/workflows/rialto-web-e2e.yml` (24 baselines).

**Out:** `packages/rialto/src/test/visual/visual.spec.ts` (the Storybook
visual suite driven by `rialto-visual.yml`). Promotion to that suite is
_named, not taken_ — same precedent as the e2e-behind-edge-csp run. Also out:
the `functional` job's `rialto-web-functional-diffs`, any change to
Playwright's tolerances or baselines, and any change to what CI considers
pass/fail.

## Decisions already made (user-selected, 2026-08-25)

- **Scope:** rialto-web only.
- **Delivery:** orphan branch + inline images in a sticky PR comment,
  `raw.githubusercontent.com` URLs. Chosen over Cloudflare R2 (needs
  credentials, more moving parts) and over a no-images summary table. The
  user reviewed and selected this comment shape:

  ```
  ## 🖼 Visual regression — 2 of 24 changed

  ### light-button-sizes  (1,204 px over 300 budget)
  | baseline | actual | diff |
  |---|---|---|
  | <img src="raw.../base.png" width=250> | ... | ... |

  <sub>22 unchanged · full artifact: rialto-web-visual-diffs</sub>
  ```

- **Release authorization:** NONE. Prepare and stop. Ship writes `release.md`
  with the exact steps and may open a PR; it must not merge, tag, publish, or
  deploy.
- **Tracker:** no tracker interaction. Work items stay checkboxes in
  `breakdown.md`. Do not create, close, or comment on GitHub issues, and do
  not seed the run from existing ones.

## Constraints

- Stack is fixed: GitHub Actions + Playwright + Node 22, as the repo already
  uses. No new services, no new secrets.
- `CI Gate` is the only required check on `main`; nothing here may change
  which checks are required or how the gate concludes.
- The existing `rialto-web-visual-diffs` artifact upload stays — this feature
  is additive to it, not a replacement.
- Never `git add -A` (the PostToolUse prettier hook leaves ~171 files dirty);
  stage by explicit path.
- Repo conventions in `CLAUDE.md` / `.claude/rules/gotchas.md` apply,
  including: scripts get real unit tests, and a `run:` block whose exit code
  is the point opens with `set -o pipefail`.

## UX surface

The user-facing surface is a rendered GitHub PR comment, not application UI.
The PRD stage decides `ux:` on its own evidence; this brief does not
pre-decide it.
