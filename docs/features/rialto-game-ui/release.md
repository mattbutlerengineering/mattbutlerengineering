---
stage: ship
run: feature:rialto-game-ui
date: 2026-08-15
---

# Release: Game-UI vibe for Rialto

## Pre-flight

| Check              | Result                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Verification green | Yes — `verification.md`, no unresolved failures. Two criteria open by construction (Linux baselines, owner verdict); the first is closed by this release, the second is not.                                                                                                                                 |
| Review clear       | Yes — `review.md`, no critical findings. One major fixed in stage, one deferred with the follow-up named.                                                                                                                                                                                                    |
| Secrets in diff    | None. `git diff main...HEAD` scanned for live Stripe keys, AWS key ids, JWTs, and PEM headers — clean. CI's Gitleaks job also passed.                                                                                                                                                                        |
| Config required    | None. The route reads no environment variable and makes no network call; `SESSION_SEED` is a fixed demo constant.                                                                                                                                                                                            |
| Migrations         | None — no Prisma schema, migration, or SQL file in the diff.                                                                                                                                                                                                                                                 |
| Rollback plan      | `git revert a3822cb58 && git push origin main`. That is a single squash commit, so one revert undoes the whole feature, and `Deploy Static Sites` redeploys `apps/rialto-web` on push to `main`. Nothing outside the repo changed: no migration to unwind, no secret to rotate, no external config to reset. |

## Release

**PR #4252**, `feat/rialto-game-ui-vibe` → `main`, squash-merged as `a3822cb58`
at 2026-08-16T02:28:13Z.

The run to green took three CI cycles. Recording all three, because the clean
version of this log would be a lie about what shipping this cost:

**Cycle 1 — `3bfd823ac`.** The visual job failed exactly as predicted: no
baselines existed for the two new screenshots. Only two files appeared in the
`rialto-web-visual-diffs` artifact, which is itself the evidence for the PRD's
"no surface that has not opted in changes visually" — all 46 pre-existing
baselines passed on that same run.

But the actuals were unusable as baselines, and that was worth finding. Both
showed the cookie banner painted over the event ticker, and both showed the
status strip sitting **underneath** DemoLayout's floating controls — which are
`position: fixed` at `--rialto-z-overlay`, above any page content by design.
Sibling demos clear that band with a `PageHeader`; this route opens straight
onto the status strip, so the LIVE flag, lap, and position were obscured on
landing. The first thing an evaluator would have seen was the feature's own
status bar hidden behind the shell's buttons. No functional test could see it:
every element was present, correct, and reachable — just covered.

Fixed in `d94ed63c7`: the route reserves the band itself
(`padding-block-start`), the visual spec pre-consents so the banner never
paints, and the two telemetry tests take a viewport tall enough to hold the HUD
without scrolling — Playwright scrolls an element into view before
screenshotting, so on a short viewport the fixed controls ride down into frame.
Measured after: controls occupy y 80–116, HUD starts at y 179.

**Cycle 2 — `d94ed63c7`.** Visual failed again (still no baselines, as
intended), this time producing clean actuals. Committed as baselines in
`afeb4a6a1`, straight from that run's artifact — Linux CI renderer, never
macOS. The two are 604 px and 672 px tall for identical content; the game
vibe's tighter density is the 68 px, and that difference is now what a
regression has to preserve.

**Cycle 3 — `afeb4a6a1`.** Visual passed. `Test (Node 22)` failed:

```
TypeError: window.matchMedia is not a function
FAIL src/__tests__/registry.test.tsx > renders a Card with a Text child via slot forwarding
```

A real regression this run introduced, which Review did not catch. Moving
`useTilt` onto `useMotionPreset` gave `Card` a transitive dependency on
`useDeviceContext`, which subscribes to media queries — so `Card` began
requiring `window.matchMedia` in any jsdom that had not stubbed it.
`packages/rialto-catalog`'s suite is exactly that environment, and it matters
well beyond this monorepo: rialto publishes to a registry, and a consumer
dropping `<Card>` into their own suite has no reason to have stubbed a DOM API
they never asked for.

Fixed in `681b1e3ee`. `ensureListeners` already fails open for SSR
(`typeof window === "undefined"`); absent `matchMedia` is the same class — no
media-query support available means no signal to read, not an error — so it
takes the same early return, and `computeSnapshot` already returns
`SSR_DEFAULTS` when the handles are null.

The regression test needed its own file. `useDeviceContext` caches its
`MediaQueryList` handles in module state, so any earlier render in the same
file satisfies the cache and the deletion goes unnoticed: the first attempt
passed 8/8 against the unfixed code for exactly that reason, and would have
shipped as a test that asserted nothing.

**Cycle 4 — `681b1e3ee`.** All checks pass, `CI Gate` green,
`mergeStateStatus: CLEAN`. Merged.

## Post-release

`Deploy Static Sites` completed successfully on `a3822cb58`.

Smoke-checked the live route with a real browser against
`https://mattbutlerengineering.com/rialto/demos/telemetry?frozen=1`:

```
SMOKE {
  "feedState": "live",
  "regions": ["Session status", "Zones", "Vitals", "Event feed"],
  "radios": [{"name":"Game","checked":"true"},{"name":"Default","checked":"false"}],
  "durations": ["0.06s", "0.09s", "0.12s"],
  "zoneRows": 8
}
PAGE_ERRORS []
```

The durations are the load-bearing line: `0.06s / 0.09s / 0.12s` are the
`game` preset's values, against a default scale of `0.1 / 0.15 / 0.2`. The vibe
is not merely deployed, it is actually applied to the rendered document in
production. The frozen feed resolves to `live` immediately, all four regions
are present, the switch lands on Game, the table has its eight zones, and the
page logs no errors.

A full-page screenshot confirms the layout fix survived to production: the HUD
clears the demo shell's floating controls, and the status strip reads cleanly.

`main`'s own push-event CI on the merge commit is green across every job
that this change can reach:

```
$ gh run list --limit 60 --json ... | select(.headSha=="a3822cb58...")
success  push          Rialto Web E2E     31921962333
success  push          ADR check          31921962345
success  push          Release            31921962324
success  workflow_run  Post-Deploy Check  31922039169
success  workflow_run  Pulumi Deploy      31922039189
```

`Rialto Web E2E` is the one worth naming: both of its jobs passed
(`Visual Regression` and `Functional`), which is the second independent Linux
runner to agree with the two committed baselines and the first to do so on
`main` rather than on the PR. That closes PRD-6 — see the 2026-08-16 amendment
in `verification.md`. `Post-Deploy Check` ran its own Playwright smoke against
the deployed surface and passed, independently of the manual smoke recorded
above.

## Open

- **Design-system owner verdict** — PRD success criterion 7, still unmet. It is
  a human gate by design: open the route side by side against the default vibe
  and record yes/no on "feels different and more alive". It is now open in
  production rather than on a branch, which is the easier place to answer it.
- **Indeterminate `Meter`** — the major deferred at Review. Six meters report
  `aria-valuenow="0"` in the `empty` and `connecting` states; for fuel and
  tyres that is a false reading rather than an unknown one. The fix is a design-
  system feature, not a route patch.
- **`SegmentedControl` drops `aria-label`** — a shipped-component defect this
  run found but deliberately did not fix.
