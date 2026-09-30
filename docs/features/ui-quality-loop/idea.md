---
stage: idea
run: feature:ui-quality-loop
date: 2026-09-28
origin: "direct — Matt, `/idea` interview 2026-09-28; not from a backlog seed (37 unclaimed UI-flavoured seeds exist in docs/backlog.md and are candidate inputs, none claimed here)"
in-flight-check: "ran 2026-09-28 (gh pr list --state open, 5 open PRs: #5881 acmm audit bot, #5879 acmm tier policy, #5848 chaos synthetic bug, #5846/#5845 dependabot) — nothing matched; no open PR or active run builds a UI-quality loop"
---

# Idea: a UI-quality loop that keeps every page at a world-class bar, with no human in the loop

## Problem

A prospect lands on mattbutlerengineering.com or the hospitality demo and, within
seconds, reads "agent-assembled": generic layouts, uneven spacing and type,
clumsy navigation, accessibility gaps, the odd bug. That impression contradicts
the only thing the site exists to prove — that an AI-run factory ships
production-grade software. The UI _is_ the sales proof, and today nothing in
the factory asks whether the output looks like a professional team built it.

Matt's words, sharpened: "continually improve our UI to make it a world-class
application — no bugs, visually appealing, doesn't look like AI built it,
incredible navigation, accessible."

## Who has it

Two personas, weighted equally (Matt's call, Q3):

1. **A founder/CTO evaluating an AI-run dev shop** — the technical buyer the
   factory-as-a-service decision (2026-07-30) targets. Copes today by skimming
   the marketing site and the hospitality demo for ~30 seconds and either
   using the footer `mailto:` or bouncing. Zero inbound to date, so today the
   coping strategy is "bounce".
2. **A restaurant operator trialling `apps/hospitality`** — the non-technical
   end user. Copes today by not using it: every hospitality run since
   2026-08-30 closed with zero observed human users in production
   (`docs/features/hospitality-service-ux/retro.md`,
   `hospitality-animations/retro.md`, `booking-guest-reuse`).

Secondary sufferer: Matt, who opens the apps and sees quality he would not
ship by hand.

## Why now

The factory's output volume has outrun its taste gate. Since the
factory-as-a-service decision the loops have shipped dozens of UI PRs, yet:

- three consecutive UI-facing runs closed with **zero observed human users**;
- `feature:hospitality-service-ux` filed **11 `[Audit]` defects against its
  own output** 37 minutes before its own merge (#5270–#5280), two of them
  user-facing and live in prod;
- **37 unclaimed UI-flavoured seeds** (a11y, navigation, visual, animation,
  contrast) sit in `docs/backlog.md` with nothing draining them;
- no gate anywhere — CI, review subagents, `/site-audit`, `mbe-auditor`,
  Lighthouse — asks "does this look agent-built?".

Every sensor exists; the loop that turns sensor output into shipped polish
against a fixed bar does not.

## Evidence

All anecdotal unless marked measured.

- **Measured 2026-09-28 (this worktree, `35517bbae`):** `apps/hospitality`
  and `apps/marketing` have **0** Playwright screenshot specs and **0** visual
  baselines — the two user-facing apps have no visual-regression floor at
  all. Coverage exists only for `apps/rialto-web` (49 baselines, `visual.spec.ts`)
  and the rialto Storybook suite (53 baselines, `rialto-visual.yml`). Any UI
  PR to hospitality or marketing can regress layout with every gate green.
- **Measured:** rough route inventory — `apps/hospitality` ~43 route paths,
  `apps/rialto-web` ~30, `apps/marketing` ~9 (grep of `path=` in `src/**/*.tsx`;
  a proper inventory is PRD work). ~80 surfaces to keep at the bar.
- **Measured:** the sensors that do exist — `lighthouse.yml` (marketing +
  rialto-web scores to KV), `audit-sweep.yml` / `audit-scout.yml`
  (`/site-audit`), `mbe-auditor` daily routine, `rialto-visual.yml`,
  `e2e-screenshots.yml`, `visual-diffs-in-pr` (shipped) — none scores
  aesthetics or navigation; none tracks per-route coverage over time.
- **Anecdote (Matt):** the apps read as AI-built to him. No external rater has
  scored them; no prospect has said so — there are no prospects yet.
- **Anecdote by absence:** zero `mailto:` inbound since the funnel went live.
  Absence is consistent with the problem and with many other causes; it is
  recorded as silence, not as a finding.
- **Prior art in-repo:** `feature:rialto-game-ui` and
  `feature:hospitality-animations` shipped visual polish; both retros note the
  polish had no production evidence and no quality gate caught what a human
  would (duplicate status announcements, meters reporting a false 0 — invisible
  to axe, 2707 unit tests, typecheck and lint).

### Community corroboration (last30days, 2026-08-30 → 2026-09-29; anecdote at community scale, not validation)

Run: 49 items across Reddit (21), Hacker News (21), YouTube (6), GitHub (1); X
not searched (not enabled), Polymarket 0. Raw file:
`~/Documents/Last30Days/vibe-coded-ui-looks-ai-generated-ai-slop-design-tells-raw-v3.md`.

- **"Can people tell?" — corroborated, this week.** HN front page
  2026-09-27: _Tells of a Slop UI_ (379 points, 238 comments) — the community
  has a named, enumerated concept of AI-UI tells. r/web_design 2026-09-27
  _Why your vibe-coded designs can feel generic?_ — u/Ireeb: "Because it's
  inherent to AI designs." r/UI_Design 2026-09-25 _Avoiding AI slop and vibe
  coding aesthetic and consistent UIs_. HN 2026-09-28 _What would a serious AI
  product look like?_ (139 points). Adjacent but same reflex at scale: HN
  2026-09-19 _AI-generated posters don't have to be horrible_ (1,899 points,
  961 comments). Liam Ottley (312k views): "we've seen an explosion of
  vibecoded apps, but they all look like crap."
- **The tells are enumerable — which makes them auditable.** Three independent
  2026 guides (Developers Digest "16 patterns", DEV "Purple Gradient Problem",
  VibeCodeKit) converge on the same list: unasked-for permanent dark theme
  (34% of surveyed pages), gradient backgrounds (27%), icon-card grids (22%),
  Inter headlines, 1px gray card borders, three-feature-card rows. A
  Show HN (2026-09-22, 74 points) trains a classifier to identify AI web
  content _from structure alone_ (arXiv 2609.15369).
- **The community's remedy is upstream, not downstream — this sharpens the
  hunch.** Every fix guide says the same thing: lock a design system / tokens
  and pick ONE aesthetic direction _before_ generating ("the root cause of slop
  is no decision"). The top human reply on r/UI_Design is u/Grenaten: "Maybe
  hire a designer?" (10 upvotes); u/Stibi: "Designers aren't paid to make
  things look pretty. Their expertise is exactly to figure out what to design."
  Implication: a post-hoc audit loop alone treats symptoms; the loop should
  also constrain generation (rialto tokens + a versioned aesthetic rubric fed
  to every UI-producing agent).
- **"Prospects judge a dev shop by it" — NOT directly evidenced.** The nearest
  item is r/vibecoding 2026-09-28 _POV: your first meeting with a VC for your
  vibe coded SaaS_ (59 points; u/Jello_Hello_Fellos: "Obviously funny and
  hyperbole"). Founder guides (SeedScope, Keyhole) say founders need literacy
  to judge AI output; none quantify buyer behaviour. Recorded as an unknown,
  not a finding; silence here is silence.
- **Automated taste rater — the kill-risk is measured, not hypothetical.**
  WebDevJudge (ICLR 2026 oral, arXiv 2510.18560): on 654 running web apps,
  human pairwise agreement 84.56% vs best LLM judge 70.34% (GPT-4.1),
  single-answer 63.91% (Claude 3.7 Sonnet) — a 14–15 point gap attributed to
  failures recognizing functional equivalence and bias. Counter-signal for the
  a11y face: CHI EA '26 _Measuring the Semantic Accessibility Gap in
  LLM-Generated Web UIs_ — 541 semantic violations in 300 UIs that axe cannot
  see (`alt="image"` passes); LLM judges hit 80–92% recall on alt-text and
  link-purpose semantics with human-comparable inter-rater agreement. So: an
  LLM judge is credible for semantic a11y today; for holistic "professional
  team built this" it trails humans by a measured margin.

## Solution hunch

Matt's shape (Q1 follow-up, Q5), plus one addition from the interview — a
hunch, not a design:

- **A daily routine** (a RemoteTrigger, like the existing `mbe-*` routines)
  that works a **page-coverage ledger**: every route across hospitality,
  marketing and rialto-web is visited on a cadence, the ledger records when
  each was last audited and what changed, so coverage is provably complete
  rather than whatever the day's audit happened to hit.
- Each visit applies a **fixed quality bar** with four faces — bugs,
  "does not look agent-built", navigation, accessibility — and routes each
  finding into the carriers the factory already has (fix PRs for the trivial,
  `ready` issues for `/implement-queue`, seeds for the rest).
- **Visual-regression baselines on hospitality and marketing** as the
  regression floor (Matt's mid-interview question: "anything we can catch with
  visual regression too?" — yes: unintended layout/spacing/colour/type shifts,
  theme drift, breakpoint regressions, per PR, deterministically; not
  aesthetics, nav clarity or copy).
- **No human in the loop** (Matt, Q5: "if possible"). The "looks agent-built"
  face therefore needs an **automated taste rater** — a multimodal judge
  scoring screenshots against a "built by a professional team" rubric — with
  at most a one-time human calibration of that rater, which is itself an
  unknown below.

## Success in one sentence

The ledger shows 100% of routes audited within the trailing 30 days, there
are zero audit-filed P1 UI defects older than 7 days, and an automated taste
rater scores every app ≥ 4/5 on "built by a professional team" — with no
human in the loop beyond a one-time rater calibration.

## Unknowns & risks

Matt rated all four as real kill-risks (Q6):

- **The LLM judge rubber-stamps its own taste.** The rater is the same model
  family that built the UI; it may score "agent-built" as fine. Dies if the
  rater cannot tell a Stripe-grade page from ours. The "no human in the loop"
  constraint makes this the load-bearing unknown — a one-time calibration set
  is the minimum concession, and whether it is enough is unproven.
- **The routine cannot reach prod or authenticated pages.** The RemoteTrigger
  sandbox has no egress to the live site (#2920), and hospitality sits behind
  Auth0 — the credential gap that closed the last three runs blind (#3546).
  The ledger may only ever cover a local build of public routes; whether that
  is the same surface a prospect sees is an open question.
- **Daily polish PRs flood and regress each other.** A daily loop opening UI
  PRs collides with implement-queue traffic, the antipattern ratchet (shared
  slack), and visual baselines that cascade ±1px (gotchas § CI). Dies as
  churn: many PRs, no visible quality gain.
- **"World-class" never converges.** Without a fixed, versioned rubric the bar
  moves every day and the loop chases its tail — an endless audit that never
  declares a page done.
- **The buyer half of the problem statement is unevidenced.** The last30days
  corroboration found "people can tell" discussed at HN-front-page scale this
  week, but nothing showing a founder/CTO or operator choosing against a
  product or dev shop because its UI read as AI-built. Community silence is
  not disconfirmation; it means the PRD's success bar cannot lean on a
  conversion claim.
- **The community's fix is upstream (constrain generation), the hunch is
  downstream (audit output).** If the loop only audits, it may file the same
  "purple gradient / icon-card grid" finding forever; the PRD should decide
  whether the loop also feeds a versioned aesthetic rubric + rialto tokens
  into every UI-producing agent.
- Not yet measured: how long one full-coverage pass over ~80 routes takes,
  what it costs per day, and whether the existing sensors' outputs can be
  joined per route at all.
