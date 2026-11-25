---
stage: prd
run: feature:rialto-signature-pass
date: 2026-11-25
ux: required
assumptions:
  - "Unattended autorun. The interview was answered from autorun-brief.md and idea.md, not question by question with the Owner."
  - "Component count: the brief and idea say 103. The repo has 98 exported components on 2026-11-25 (`packages/rialto/src/components/index.ts`; 98 component directories besides `_ambient`, same on origin/main; `registry.json` lists 189 entries because it counts subcomponents). Scope is taken as every component exported from that index at audit time, not a fixed number."
  - "Severity: the brief's 'critical and serious' is read as axe-core impact levels (critical, serious), plus any manually found defect that fails a WCAG 2.2 Level A or AA success criterion, which counts as serious. The old audit carries no severity labels, so the re-check classifies each finding."
  - "'More accent roles beyond gold' (plural) is read as at least two new accent roles."
  - "Uniqueness verdict notification and deadline: a GitHub issue labelled `ready-for-human` and assigned to Matt (the repo's channel for Owner actions), due 7 days after Ship's release.md is written, matching the brief's Operate wait. The issue states the calendar date."
  - "The two stock component kits for the uniqueness comparison are Matt's choice, named in the verdict issue. The brief does not name them."
  - "`forced-colors` and `prefers-contrast` support (idea.md hunch 5) is neither in nor out in the brief. It enters only where the audit rates a missing case critical or serious; blanket support is filed as an issue."
---

# PRD: Rialto signature pass

## Problem statement

A host working a Friday service spends the shift in a UI that is either very
light or very dark, with one gold accent and no personality. It looks like any
SaaS dashboard. The palette is warm neutrals plus a single amber-gold accent
described in the token source as "surgical use only"
(`packages/rialto/src/tokens/colors.json`), and that is why the UI reads as
"very light or very dark". The screen also looks the same at 3pm on a quiet
Tuesday as it does at 8pm on a packed Friday.

The components staff touch most still carry accessibility defects. The last
audit (`packages/rialto/docs/ui-audit.md`, last changed 2026-05-16) covered
63 components and found problems in 48. Its findings include nested
interactives (Navbar, Tag), Slider arrow keys moving two steps, colour-only
status in Timeline, no `aria-live` on async changes, and clicks bound to
`role="presentation"` wrappers. Nobody has re-checked those findings. Of today's 98 components, 36
have never been audited, and no component handles
`forced-colors` or `prefers-contrast`.

## Solution

When this ships:

- **A richer palette.** Rialto has mid-tone surfaces between the current
  light and dark extremes, plus accent roles beyond gold. Every component
  inherits them through tokens, and every token pair still passes the
  contrast tests.
- **A current audit.** Every exported component has a dated audit row
  covering accessibility, visual quality and interaction. Each of the 48 old
  findings is marked fixed, still open or obsolete.
- **No serious accessibility defects.** Every critical and serious finding is
  fixed.
- **A UI that reads the room.** The hospitality app moves into a calmer,
  higher-emphasis rush mode as live service load climbs, and settles back as
  the room empties. Nobody touches a setting, and no control moves or resizes
  under a host's hands. Today's signal is the reservation and cover data
  that `useDashboardStatsQuery` derives (`expectedCovers`, `upcomingCount`,
  `waitlistCount`, `longestWaitMinutes`;
  `apps/hospitality/src/hooks/useDashboardStatsQuery.ts`). It stays fresh
  because `useSSESync` invalidates queries on `reservation:*` and
  `table:updated` events (`apps/hospitality/src/hooks/useSSESync.tsx`,
  `packages/types/src/sse-events.ts`). The mode builds on the existing
  `vibe` presets of `RialtoProvider` (`packages/rialto/src/providers/vibes.ts`).

## Actors

- **Host:** venue staff at the stand who seat guests and work the
  hospitality app through a service.
- **Manager:** venue staff who run the floor and the shift in the same app.
- **Prospect:** someone deciding whether to work with Matt, who judges the
  craft from rialto-web and the demos.
- **Owner (Matt):** owns Rialto and gives the go/no-go on the palette and the
  uniqueness verdict.

## User stories

1. As a Host, I want screens with real colour and mid-tone surfaces, so that
   the UI is easy on the eyes through a long shift and feels like this venue's
   tool, not a generic dashboard.
2. As a Host, I want the screen to tighten emphasis and quiet its motion on
   its own when the room fills, so that I can see what matters during a rush
   without finding a setting.
3. As a Host, I want every control to stay exactly where it was when the mode
   shifts, so that I never mis-tap mid-service.
4. As a Manager who uses a keyboard, screen reader, high-contrast or
   reduced-motion setting, I want every Rialto component to work with it, so
   that the app is usable whatever my access needs.
5. As a Prospect, I want rialto-web and the demos to look unmistakably like
   Rialto, so that I take the craft seriously.
6. As the Owner, I want to see the new palette on five primitives before it
   spreads, so that I can stop the run cheaply if it does not read as Rialto.
7. As the Owner, I want a current audit of every component, so that I know
   exactly what is fixed, what is open and what is deferred.

## Success criteria

1. [ ] **Kill test first.** Before/after screenshots of Button, Input, Select,
       Card and Tabs in the candidate palette, in light and dark, are shown to
       Matt side by side. His go or no-go is recorded in writing before any
       other component's styling changes. A no-go stops the palette work.
2. [ ] **Palette.** The tokens add at least one mid-tone surface step between
       the current light and dark surface extremes, and at least two accent
       roles beyond gold. Each has light and dark values.
3. [ ] **Contrast holds.** `packages/rialto/src/test/token-contrast.test.ts`
       covers every new token pair and passes in light and dark: 4.5:1 for
       text and 3:1 for non-text UI.
4. [ ] **Complete audit.** The audit document has a row dated on or after
       2026-11-25 for every component exported from
       `packages/rialto/src/components/index.ts` when Verify runs. Each row
       covers accessibility, visual quality and interaction, and every
       finding has a severity. A script or test diffs the rows against the
       index and fails on a missing component.
5. [ ] **Old findings re-checked.** Every finding from the 2026-05-16 audit is
       marked `fixed`, `open` (with a severity) or `obsolete` (for example,
       GenCopilot no longer exists).
6. [ ] **Zero open critical or serious findings.** Every critical or serious
       finding is fixed, and each fix is pinned by a test that fails
       without it. The vitest-axe matrix reports no critical or serious
       violations. Moderate and minor findings are filed as GitHub issues.
7. [ ] **Service-aware mode with no setting.** On the hospitality screens it
       covers, the mode is derived from live service data alone, with no
       toggle, setting or setup step. A test proves that a rising load signal
       enters rush mode and a falling one leaves it.
8. [ ] **Nothing moves under a host's hands.** An automated test records the
       bounding box of every interactive element on each covered screen
       before and after a mode transition, and fails on any change in
       position or size.
9. [ ] **No flapping.** A load signal oscillating across the rush threshold
       does not flip the mode back and forth within the hysteresis window that
       architecture.md sets. A test proves it.
10. [ ] **Reduced motion respected.** With `prefers-reduced-motion: reduce`
        the transition animates nothing. The existing motion guard tests
        stay green.
11. [ ] **The demo runs as written:**
        Before: a host's screen looks the same at 3pm on a quiet Tuesday as at
        8pm on a packed Friday, pale or dark with one gold accent. After: the
        same screen, in a richer Rialto palette, shifts into a denser, calmer,
        higher-emphasis rush mode as covers climb, and settles back as the room
        empties, with nobody touching a setting.
12. [ ] **Uniqueness verdict.** Matt, shown the result beside two stock
        component kits, gives a written verdict on whether it is unmistakably
        Rialto. Owner: Matt. Notification: a GitHub issue labelled
        `ready-for-human`, assigned to Matt, opened when Ship's release.md is
        written. Deadline: 7 days after that, with the calendar date written
        in the issue. A missing verdict by the deadline counts as not met, not
        as a pass.
13. [ ] **Release hygiene.** Every Rialto source change carries a changeset.
        Visual baselines change only through `visual-baseline-regen.yml`.
        `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.

## Out of scope

Each item below is filed as a GitHub issue, not built in this run.

- Visual restyle batches beyond what the palette change gives components
  through tokens.
- New components: RadioGroup, Switch, Spinner, Toolbar, Listbox, TagsInput,
  FileUpload/Dropzone and VisuallyHidden.
- The Moonshot: Rialto as a per-venue living identity, already seeded in
  `docs/backlog.md`.
- Cutting a Rialto npm release, and any merge, deploy, tag or publish. The
  run prepares the work and stops.
- Fixing moderate or minor audit findings.
- Blanket `forced-colors` and `prefers-contrast` support beyond what
  critical or serious fixes need.
- Service-aware mode on rialto-web, the marketing site or the public booking
  pages. It covers staff screens in the hospitality app only.

## Open questions

- **Load signal and thresholds.** What signal counts as "load": expected
  covers, upcoming arrivals, the waitlist, seated tables against capacity
  (`table:updated` / `TableStatusDelta`), or a mix? Where do the thresholds
  and the hysteresis window sit? Answered by the Architect, using the
  two-day spike in idea.md.
- **Which screens.** Which hospitality screens get the mode first (HomePage
  uses `useDashboardStatsQuery`; Timeline and Reservations are candidates)?
  Answered by UX Design.
- **Density without resizing.** The existing vibes create density by
  shrinking spacing tokens (`--rialto-space-*`), which can move or resize
  controls. That conflicts with criterion 8. How does rush mode express
  "denser" and "higher emphasis" without changing any control's box?
  Answered by UX Design and the Architect, and proved by the spike.
- **Verifying behind Auth0.** Hospitality sits behind Auth0, so the live mode
  cannot be audited on the production site. Can the demo and criterion 11
  run against the deterministic service simulator
  (`apps/hospitality/src/components/rehearsal/simulate-service.ts`) or local
  dev? Answered by the Architect and Verify.
- **Baseline churn.** A palette change flips visual baselines in three suites
  at once (rialto Storybook, rialto-web, hospitality). How should the
  regeneration be sequenced so a red visual run does not cascade onto later
  PRs? Answered by Decompose.
- **The taste rater.** Can the uncalibrated taste rater (all 43 records
  `calibration.status: "stale"`) ever back the uniqueness verdict, or does
  Matt's verdict stay the only check? Answered by Matt, after the run.
