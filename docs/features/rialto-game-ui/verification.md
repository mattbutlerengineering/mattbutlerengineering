---
stage: verify
run: feature:rialto-game-ui
date: 2026-08-15
---

# Verification: Game-UI vibe for Rialto

## Summary

Seven PRD success criteria, eighteen breakdown work items. **Five PRD criteria
pass on evidence, one is partially verified and finishes in CI, one cannot be
verified by this process at all — it is a human verdict.** All eighteen
breakdown items pass. One criterion failed on first measurement and was fixed
during this stage rather than deferred; the fix and the standing gate that now
protects it are recorded below.

Verdict: the built thing meets its criteria, with two open gates that are
open by construction — the Linux visual baselines and the design-system
owner's side-by-side verdict. Neither is a defect; both are work that cannot
happen on this machine.

**Amendment 2026-08-16 — one of those two gates has closed.** PRD-6's CI half
finished and passed; the tally is now six criteria passing on evidence and one
human gate outstanding. The original PARTIAL below is left as written — it was
an accurate account of what could be proven on 2026-08-15, and the point of
recording an open gate is to be able to show later that it closed.

## Criteria & evidence

### PRD-1 — Every interactive element on the demo route produces a visible state change within 100 ms

The criterion is a property of resolved CSS, not of any single interaction, so
it was measured across every element the route renders rather than by driving
one control. Two things can break it: a `transition-delay`, which defers the
change outright, and a duration over budget.

- Check: computed-style sweep over `[data-feed-state] *` on
  `demos/telemetry?frozen=1` under the `game` vibe, reading
  `transition-delay` and `transition-duration` off all 415 elements.
- Evidence — **first run, before any fix**:
  ```
  MEASURED {"maxDelay":0,"maxDuration":150,"elements":415}
    Error: expect(received).toBeLessThanOrEqual(expected)
  1 failed
  ```
  Located to two elements:
  ```
  150ms  <button class="_segment_7fi03_30 _focusRing_ik4wr_70 _segmentActive_7fi03_53"> prop=color
  150ms  <button class="_segment_7fi03_30 _focusRing_ik4wr_70"> prop=color
  ```
  `SegmentedControl.module.css:46` held `transition: color 0.15s
var(--rialto-ease-precision)` — a literal no vibe can reach. The route's own
  vibe switch was therefore running on default timing while everything around
  it ran at the game preset's 90 ms.
- Fix (commit `b9473cdf6`): value-preserving substitution to
  `var(--rialto-duration-standard)` — `0.15s` is exactly that token's default,
  so nothing changes for consumers on the default vibe. `SegmentedControl`
  joined the ten components already guarded by `duration-tokens.test.ts`,
  which failed first with the exact substitution it wanted:
  ```
  × SegmentedControl uses duration tokens, not literals, in its transitions
  +   "0.15s → var(--rialto-duration-standard)",
  Tests  1 failed | 11 passed (12)
  ```
- Evidence — **after the fix**:
  ```
  MEASURED {"maxDelay":0,"maxDuration":90,"n":415}
  1 passed (3.0s)
  ```
- Result: **PASS** (after in-stage fix)

The measurement is no longer a one-off. `telemetry.spec.ts` now carries it as a
standing gate, so a future untokenized literal and a mis-set token fail the
same test:

```
✓  6 › response latency › no element on the route defers or overruns the 100ms budget (1.2s)
```

### PRD-2 — The accessibility suite passes on the demo route with zero exceptions

- Check: axe-core sweep of the frozen route, then the full functional E2E job
  exactly as CI invokes it.
- Evidence:
  ```
  ✓  1 › a11y: Telemetry HUD page has no critical violations (2.1s)
  1 passed (4.0s)
  ```
  ```
  54 passed (1.5m)
  ```
  (`a11y-pages`, `interaction`, `navigation`, `search`, `theme`, `demo-nav`,
  `telemetry` — the seven specs listed by full path in
  `.github/workflows/rialto-web-e2e.yml`.)
- Result: **PASS**

### PRD-3 — Contrast ratios meet WCAG AA under the new vibe, both themes

The `game` preset was designed to make this checkable rather than auditable:
it overrides no colour token at all, so both themes keep the palette
`token-contrast.test.ts` already covers. The test asserts that property
directly, which makes it a guard against colour creeping in later.

- Check: `vibes.game.test.tsx` + `token-contrast.test.ts`.
- Evidence:
  ```
  Test Files  2 passed (2)
       Tests  38 passed (38)
  ```
- Result: **PASS**

### PRD-4 — Every action reachable by keyboard and announced, at parity with the default vibe

- Check: keyboard traversal of the route's controls in a real browser;
  screen-reader-relevant names asserted through role queries.
- Evidence:
  ```
  ✓ › keyboard › reaches the vibe switch in reading order (1.3s)
  ✓ › keyboard › offers reconnect as a real control when the feed is stale (1.3s)
  ✓ › reduced motion › the current zone is still announced (1.2s)
  ```
- Result: **PASS**, with a defect recorded against rialto, not against this
  run: `SegmentedControl` spreads `aria-label` onto its wrapper while
  `role="radiogroup"` sits on an inner element, so the group has no accessible
  name. It affects every consumer that labels a `SegmentedControl` and it
  affects the default vibe identically — so parity, which is what this
  criterion asks for, holds. The individual radios are named, reachable, and
  arrow-key navigable. Logged in `breakdown.md` Notes (2026-08-15); worth its
  own issue.

### PRD-5 — A defined `prefers-reduced-motion` presentation exists and is asserted by a test

The distinction the criterion draws — a designed presentation, not a blanket
kill-switch — is what the spec asserts: same regions, same values, nothing
reachable only through motion.

- Check: `telemetry.spec.ts` under emulated `reducedMotion: "reduce"`,
  comparing region set and zone values against a full-motion run.
- Evidence:
  ```
  ✓ › reduced motion › renders every region, with the same values as full motion (1.4s)
  ✓ › reduced motion › resolves every duration token to 0s (1.1s)
  ✓ › reduced motion › the current zone is still announced (1.2s)
  ```
- Result: **PASS**

### PRD-6 — No surface that has not opted in changes visually; existing baselines pass unmodified

- Check: diff of every baseline PNG on the branch, plus the full functional
  suite (which exercises the non-opted-in demo pages).
- Evidence:
  ```
  $ git diff --name-only main...HEAD | grep -i '\.png$'
  no PNG touched in branch

  $ git diff --stat main...HEAD -- apps/rialto-web/e2e/screenshots packages/rialto/src/test/visual
  (empty)
  ```
  ```
  54 passed (1.5m)
  ```
- Result: **PARTIAL** — the "unmodified" half is proven: this branch modifies
  no baseline. The "pass" half cannot be proven here. Playwright screenshots
  are Linux-CI-runner-specific and this machine is macOS, so running the
  visual job locally would compare the wrong renderer and prove nothing. It
  finishes in CI. Note that the one substantive change to a shipped component
  in this stage (`SegmentedControl`) is value-preserving by construction —
  `0.15s` is `--rialto-duration-standard`'s default — so it cannot move a
  default-vibe pixel.

- **Amendment 2026-08-16 — closed to PASS.** "It finishes in CI" finished.
  The visual job has now rendered these baselines on two independent Linux
  runners and matched both times: once on PR #4252, and again on the `push`
  event for the merge commit `a3822cb58`, which is the authoritative run on
  `main`:
  ```
  $ gh run view 31921962333 --json jobs
  success  Visual Regression (rialto-web)   2026-08-16T02:30:51Z
  success  Functional (rialto-web)          2026-08-16T02:31:14Z
  ```
  The second run matters more than the first. The two new baselines were
  committed from a CI artifact rather than rendered locally, so a single green
  run could not distinguish "these are correct" from "these happen to match the
  one runner that produced them". A second runner, on a different event, at a
  different commit, agreeing pixel-for-pixel, is what rules that out — and the
  same run re-proved the "unmodified" half by passing all 46 pre-existing
  baselines untouched.

### PRD-7 — The design-system owner records a yes/no verdict on "feels different and more alive"

- Check: none possible.
- Result: **NOT VERIFIED — human gate.** This criterion is deliberately not
  automatable; it is the acceptance gate for the subjective claim the whole
  run rests on. It needs Matt to open `demos/telemetry` side by side against
  the same components under the default vibe and record yes or no. Everything
  else in this document is a precondition for that judgement, not a substitute
  for it.

### Breakdown work items (18)

All eighteen are checked, and the suites that back them are green. Rather than
restate each acceptance line, the evidence is the full local run of every gate
CI runs:

- Check: complete unit and type gates for both changed packages, plus the CI
  functional E2E job.
- Evidence:
  ```
  packages/rialto     Test Files  137 passed (137)     Tests  2125 passed (2125)
  apps/rialto-web     Test Files   45 passed (45)      Tests   582 passed (582)
  packages/rialto     tsc --noEmit                     (clean)
  apps/rialto-web     tsc --noEmit                     (clean)
  apps/rialto-web     lint                             0 errors, 149 warnings (repo baseline)
  functional E2E      54 passed (1.5m)
  ```
- Result: **PASS**

Items whose acceptance is structural rather than behavioural were checked
directly: `workflow-coverage.test.ts` passes, which is the assertion that every
`e2e/*.spec.ts` is listed by full path in the workflow and never by glob.

## Failures

None outstanding.

One criterion (PRD-1) failed on first measurement at 150 ms against a 100 ms
budget. It was fixed in-stage rather than routed back to Implement, because the
fix was a one-token substitution with a test that already knew the answer, and
because leaving it would have meant re-running the whole gate suite for a
one-line change. The failure, the fix, and the re-measurement are all recorded
above; the commit is `b9473cdf6`.

Worth naming plainly: this is the criterion the entire feature exists to
satisfy, and every suite was green while it was being missed on the route's own
vibe switch. Nothing in the unit tests, the type checks, the linter, or the
accessibility sweep could see it — the component rendered correctly, it just
rendered at the wrong speed, and no test measured speed until this stage did.
The standing gate now closes that hole for this route.

## Not verified

- **Visual baselines (PRD-6, second half).** Screenshots are
  Linux-CI-runner-specific; this is macOS. Running the visual job here would
  compare against the wrong renderer. `telemetry-game.png` and
  `telemetry-default.png` do not exist yet by design — they are pulled from the
  PR's first `rialto-web-visual-diffs` artifact. Recorded as a Ship gate in
  `breakdown.md` (2026-08-15). Ship must not merge until both are committed
  from that artifact and the visual job is green. **Closed 2026-08-16:** both were
  committed and the visual job is green on `main` — see the PRD-6 amendment
  above. The only gate still open in this run is PRD-7.
- **The design-system owner's verdict (PRD-7).** A human judgement, by design.
- **Cross-browser behaviour.** Every E2E result above is Chromium only, which
  is what `playwright.config.ts` runs. Firefox and WebKit are unexercised for
  this route, exactly as they are for every other route in this app — not a gap
  this run introduced, but not covered either.
- **Real assistive-technology output.** Announcements were verified through
  ARIA roles and accessible names, and through axe-core. No screen reader was
  actually driven. That is the normal limit of this suite and it is why the
  `SegmentedControl` naming defect above was found by a role query rather than
  by listening.
