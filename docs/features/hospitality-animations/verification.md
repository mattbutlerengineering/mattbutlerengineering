---
stage: verify
run: feature:hospitality-animations
date: 2026-08-30
tracking: "#4746"
pass: 2
verified-head: "66deee3ac"
assumptions:
  - "Pass 2 verified the worktree branch `worktree-hospitality-animations` at HEAD `66deee3ac` (pass 1's `338703391` + the Implement fix `fix(rialto): let NeonSign's reduced-motion rules win the cascade`), not a PR head — no PR exists yet, so the Repo criterion's PR / `CI Gate` / Review halves stay NOT VERIFIED rather than assumed."
  - "Pass 2 re-ran every gate (A1–A6, incl. both app builds) and every check whose input `66deee3ac` touched (B2, B3, B4, B5, F3, the scope stat). Rows B1, B6–B10, C1–C4, D1–D11, E1–E6, F1, F2 carry their pass-1 evidence from `338703391`: the fix commit changes only `NeonSign.module.css` selectors/comments and adds `NeonSign.cascade.test.ts` (`git show 66deee3ac --stat`), and the full-suite re-runs produced identical counts for rialto-web (54/699) and hospitality (137/1763) and the expected +1 file / +4 tests for rialto (146/2228 → 147/2232)."
  - "`origin/main` advanced 4 commits (#4766–#4769) past the branch's merge-base `500affc76` during the fix cycle; they are not in HEAD, so the scope stat is taken against the merge-base and those commits are not verified here."
  - "Root `pnpm typecheck` at `66deee3ac` was a full turbo cache hit (48 cached / 48) — the fix agent's run had identical inputs. Accepted as a pass because turbo's hash covers the sources; a cold run was not forced."
  - "The cascade test's RED on the pre-fix CSS was demonstrated without touching the tree: a byte-identical copy of `NeonSign.cascade.test.ts` (verified with `cmp`) placed beside `git show 338703391:…NeonSign.module.css` in a scratch dir and run through rialto's own vitest config via `--dir`; the same harness with the HEAD CSS is green."
  - "The hashed reduced class for the B3 probe was derived from the first stylesheet selector containing BOTH `_neonSign_` and `_reduced_` (`._neonSign_4xynw_9._reduced_4xynw_166 ._tube_4xynw_67`); a naive `/reduced/` search returns Handshake's `._reduced_gulba_155 ._pulse_gulba_126` first."
  - "Criteria list = every prd.md success criterion + every breakdown.md acceptance criterion not already covered + the brief's hard constraints (untouched surfaces, no new dependency, `Closes #N` trailers). Gate commands run from inside each package per the brief."
  - "The first `pnpm --dir apps/hospitality build` failed on a stale, gitignored `packages/auth/dist` that predated the merged #4736 (`hasAuthParams` re-export); root `pnpm typecheck` (turbo `dependsOn: ['^build']`) rebuilt it 61 s later and the rerun passed. Treated as an environment race, not a defect of the diff — both runs are quoted."
  - "The only rendered check is the built rialto-web showcase served by `vite preview` on port 5199 under its `/rialto/` base; the hospitality dashboard needs Auth0 and is NOT VERIFIED live (unit evidence cited instead). The advisory `Hospitality E2E` suite was not run (no `E2E_*` env in this shell; out of the run's scope)."
  - "Reduced motion was measured two ways in Chromium on the showcase: Playwright `emulateMedia({ reducedMotion: 'reduce' })`, and a DOM-only probe that adds the hashed `.reduced` class to two sign roots under no-preference. The hospitality dashboard's reduced-motion behaviour is deduced from the rules its built CSS ships (the same hashed rules the probe exercised) plus the absence of any `!important` reset in that bundle — it was not rendered live (Auth0). No source file was changed."
  - "Grading rule: a criterion whose stated jsdom check passes but whose measured browser mechanism fails is recorded as a FAIL on its own row (B3), not softened into a note on the passing row (B2)."
---

# Verification: Neon OPEN sign (hospitality-animations)

## Summary

**Pass 2 at `66deee3ac` — 41 criteria: 40 pass, 0 fail, 1 not verified** (plus the
partial-verification caveats listed under "Not verified"). Every automated gate is green at the
new HEAD (rialto 2232/2232 incl. the new cascade test, rialto-web 699/699, hospitality
1763/1763, root typecheck 48/48, `regen --check` clean, both app builds exit 0), the showcase
renders all four states with the contract attributes, and the brief's hard constraints hold.
Pass 1's two failures (B2, B3 — one root cause: the instrument's reduced-motion rules lost the
cascade to its own `.neonSign[data-state=…] .tube` state rules) are cleared by the Implement
fix: the state animations now sit on `.neonSign:where([data-state="…"]) .tube` (0,2,0) and the
reduced rules on `.neonSign.reduced .tube` / media `.neonSign[data-state] .tube` (0,3,0).
Measured in Chromium on the rebuilt showcase with **no** media emulation, adding the hashed
`.reduced` class alone flips both tubes' computed `animation-name` from the strike/breathe to
`none` with `getAnimations()` empty (opening-soon parks at opacity `0.8`); under emulated
reduce all nine signs read `data-reduced-motion="true"` and `animation-name: none`. The
hospitality bundle ships the same eleven hashed rules byte-for-byte, so the class path now
works there without any host reset. `NeonSign.cascade.test.ts` fails on the pre-fix CSS with
the exact specificity assertion and passes on HEAD. Proceeds to Review.

Scope of the change (`git diff --stat 500affc76 HEAD`, the merge-base with `origin/main`;
`origin/main` itself is 4 commits ahead of that base, see assumptions):

```
 .changeset/neon-sign-instrument.md                 |   9 +
 apps/hospitality/CLAUDE.md                         |   2 +-
 apps/hospitality/llms-full.txt                     |  41 ++++
 apps/hospitality/llms.txt                          |  21 ++
 .../src/components/PageHeader.module.css           |  19 ++
 .../hospitality/src/components/PageHeader.test.tsx |  14 ++
 apps/hospitality/src/components/PageHeader.tsx     |   9 +-
 apps/hospitality/src/hooks/useNow.test.ts          |  83 +++++++
 apps/hospitality/src/hooks/useNow.ts               |  21 ++
 apps/hospitality/src/pages/HomePage.test.tsx       | 144 ++++++++++-
 apps/hospitality/src/pages/HomePage.tsx            |  21 +-
 apps/hospitality/src/utils/format.test.ts          |  14 ++
 apps/hospitality/src/utils/format.ts               |  17 ++
 apps/hospitality/src/utils/venueOpenLabel.test.ts  |  48 ++++
 apps/hospitality/src/utils/venueOpenLabel.ts       |  36 +++
 apps/hospitality/src/utils/venueOpenState.test.ts  | 264 +++++++++++++++++++++
 apps/hospitality/src/utils/venueOpenState.ts       | 166 +++++++++++++
 apps/rialto-web/src/data/page-registry.test.ts     |   1 +
 apps/rialto-web/src/data/page-registry.ts          |   1 +
 apps/rialto-web/src/hooks/manifest-drift.test.ts   |   1 +
 apps/rialto-web/src/pages/data/NeonSignPage.tsx    | 183 ++++++++++++++
 docs/features/hospitality-animations/breakdown.md  | 112 +++++++++
 llms-full.txt                                      |  41 ++++
 llms.txt                                           |  21 ++
 packages/rialto/package.json                       |   4 +
 packages/rialto/registry.json                      |  41 ++++
 .../components/NeonSign/NeonSign.cascade.test.ts   | 172 ++++++++++++++
 .../src/components/NeonSign/NeonSign.module.css    | 182 ++++++++++++++
 .../components/NeonSign/NeonSign.motion.test.tsx   |  26 ++
 .../src/components/NeonSign/NeonSign.stories.tsx   |  62 +++++
 .../src/components/NeonSign/NeonSign.test.tsx      |  97 ++++++++
 .../rialto/src/components/NeonSign/NeonSign.tsx    |  89 +++++++
 packages/rialto/src/components/NeonSign/index.ts   |   1 +
 packages/rialto/src/components/index.ts            |   1 +
 .../src/test/accessibility/a11y-matrix.test.tsx    |   1 +
 .../src/test/accessibility/component-fixtures.tsx  |   6 +
 36 files changed, 1964 insertions(+), 7 deletions(-)
```

Full logs for every gate are in the session scratchpad
(`/private/tmp/claude-501/-Users-mbutler-github-mattbutlerengineering/0b2177c3-482d-404b-9fba-148c79c0c315/scratchpad/*.log`,
pass-2 logs prefixed `p2-`); only the decisive lines are quoted below.

## Pass history

| Pass | HEAD        | When (PDT)              | Result                                                                                                                                                                                                                                                                                                      |
| ---- | ----------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `338703391` | 2026-08-30 ~22:00–22:15 | **FAIL** — 38 pass / 2 fail (B2, B3) / 1 not verified. Root cause: `.reduced .tube` (0,2,0) and the media-block `.tube` (0,1,0) lost to `.neonSign[data-state="open"\|"opening-soon"] .tube` (0,3,0); measured in Chromium (class added → strike kept `0.9s`, breathe kept `running`). Routed to Implement. |
| 2    | `66deee3ac` | 2026-08-30 22:33–22:45  | **PASS** — 40 pass / 0 fail / 1 not verified. Fix `fix(rialto): let NeonSign's reduced-motion rules win the cascade` (22:31:49 -0700) re-verified: gates re-run, B2/B3 re-measured (below), cascade test shown RED on the pass-1 CSS and GREEN on HEAD. Proceeds to Review.                                 |

The pass-1 failure text is preserved verbatim in the B2/B3 rows' "Pass 1" sub-blocks.

## Criteria & evidence

### A. Package gates (brief § success criteria; prd.md "Success criteria" preamble)

#### A1. `packages/rialto`: lint, typecheck, test green

- Check: `pnpm --dir packages/rialto lint` / `typecheck` / `test`
- Evidence:
  ```
  rialto lint exit=0        ✖ 159 problems (0 errors, 159 warnings)   # pre-existing warnings, none in NeonSign/
  rialto typecheck exit=0   > tsc --noEmit
  rialto test exit=0        Test Files  147 passed (147)   Tests  2232 passed (2232)   Duration  85.44s
  ```
  Re-run at `66deee3ac` (pass 1 at `338703391` read 146 files / 2228 tests; the +1 / +4 is
  `NeonSign.cascade.test.ts`). Targeted runs at the new HEAD:
  ```
  pnpm --dir packages/rialto test -- --run src/components/NeonSign         exit=0   Test Files  3 passed (3)   Tests  23 passed (23)
  pnpm --dir packages/rialto test -- --run src/components/NeonSign/NeonSign.cascade.test.ts   exit=0   Tests  4 passed (4)
  ✓ NeonSign.cascade.test.ts > … > finds the strike and the breathe bound to the tube (parser sanity)
  ✓ NeonSign.cascade.test.ts > … > finds an animation: none rule on the tube for both reduced-motion paths
  ✓ NeonSign.cascade.test.ts > … > useReducedMotion() → .reduced rules beat every animated tube rule on specificity alone
  ✓ NeonSign.cascade.test.ts > … > @media (prefers-reduced-motion: reduce) rules beat every animated tube rule on specificity alone
  ```
- Result: PASS

#### A2. `packages/rialto`: exports map in sync (`exports:check`)

- Check: `pnpm --dir packages/rialto exports:check`
- Evidence:
  ```
  exports:check exit=0
  [generate-exports] exports map already in sync.
  ```
  (Re-run at `66deee3ac`; identical output.)
- Result: PASS

#### A3. `apps/rialto-web`: lint, typecheck, test, build green (after the rialto build)

- Check: `pnpm --dir apps/rialto-web lint` / `typecheck` / `test` / `build`; `grep -rl "NeonSign\|neon-sign" apps/rialto-web/dist/assets | head -3`
- Evidence:
  ```
  rialto-web lint exit=0        ✖ 151 problems (0 errors, 151 warnings)
  rialto-web typecheck exit=0   > tsc --noEmit
  rialto-web test exit=0        Test Files  54 passed (54)   Tests  699 passed (699)   Duration  32.61s
  rialto-web build exit=0       ✓ built in 1.02s
  apps/rialto-web/dist/assets/NeonSignPage-B7NtLUXh.js
  apps/rialto-web/dist/assets/NeonSignPage-B7NtLUXh.js.map
  ```
  Re-run at `66deee3ac` (pass 1: identical lint/typecheck/test counts; build `✓ built in 663ms`,
  chunk `NeonSignPage-DGv5UqaF.js`). This rebuilt dist is what the B2/B3 browser measurements served.
- Result: PASS

#### A4. `apps/hospitality`: lint, typecheck, test, build green

- Check: `pnpm --dir apps/hospitality lint` / `typecheck` / `test` / `build` (pass 1's build ran twice, see below)
- Evidence (re-run at `66deee3ac`):
  ```
  hospitality lint exit=0        ✖ 124 problems (0 errors, 124 warnings)
  hospitality typecheck exit=0   > tsc --noEmit
  hospitality test exit=0        Test Files  137 passed (137)   Tests  1763 passed (1763)   Duration  71.54s
  hospitality build exit=0       ✓ built in 818ms      (first attempt; no stale-dist race this pass)
  apps/hospitality/dist/assets/rialto-vendor-D92FT4gy.css   187003 bytes, 22:39   (the bundle B2 greps)
  ```
  Pass 1 at `338703391` (identical lint/typecheck/test counts; its build history kept for the record):
  ```
  hospitality build exit=1  (first run, 22:03:48)
    [MISSING_EXPORT] "hasAuthParams" is not exported by "../../packages/auth/dist/react/index.js".
      src/App.tsx  import { useAuth, isSafeReturnTo, hasAuthParams } from "@mbe/auth/react";
  hospitality build (rerun) exit=0   ✓ built in 571ms
  ```
  Root cause of the first run, measured: `apps/hospitality/src/App.tsx` is untouched by this run
  (F1) and `git diff --stat origin/main HEAD -- packages/auth` prints 0 lines; the re-export was
  merged in via `e06b2951d feat(auth): … re-export hasAuthParams (#4736)` (2026-08-30 20:53), and
  `packages/auth/dist/react/index.js` (gitignored: `.gitignore:6:dist/`) was rebuilt at 22:04:49 by
  root `pnpm typecheck` (`turbo.json:55 "dependsOn": ["^build", …]`) — after the failing build
  (log 22:03:48) and before the passing rerun. Post-rebuild the dist carries the export:
  `packages/auth/dist/react/index.js:6:export { hasAuthParams } from "react-oidc-context";`.
- Result: PASS (stale-dependency-dist race in the worktree; not a defect of the diff)

#### A5. Root `pnpm typecheck`

- Check: `pnpm typecheck` (turbo, all packages)
- Evidence:
  ```
  root typecheck exit=0
   Tasks:    48 successful, 48 total
  Cached:    48 cached, 48 total
    Time:    157ms >>> FULL TURBO
  ```
  Re-run at `66deee3ac` — a full cache hit (the fix agent's run had identical inputs; pass 1
  at `338703391` was `25 cached / 48`, `26.242s`). See assumptions.
- Result: PASS

#### A6. `pnpm regen --check` clean

- Check: `pnpm regen --check`
- Evidence:
  ```
  regen --check exit=0
  All generated artifacts are up to date.
  ```
  (Re-run at `66deee3ac`; identical output.)
- Result: PASS

### B. Rialto instrument (`packages/rialto`)

#### B1. Renders `role="img"` with required `aria-label`; `data-state` ∈ open | opening-soon | closed | unset

- Check: `pnpm --dir packages/rialto test -- --run src/components/NeonSign --reporter=verbose`; browser DOM read on the showcase States section (C1)
- Evidence:
  ```
  ✓ NeonSign.test.tsx > NeonSign > structure > renders as an image with the required accessible name and exposes its state
  ✓ NeonSign.test.tsx > NeonSign > state > exposes data-state=open on the root
  ✓ NeonSign.test.tsx > NeonSign > state > exposes data-state=opening-soon on the root
  ✓ NeonSign.test.tsx > NeonSign > state > exposes data-state=closed on the root
  ✓ NeonSign.test.tsx > NeonSign > state > exposes data-state=unset on the root
  Test Files  2 passed (2)   Tests  19 passed (19)
  ```
  Browser (`[role="img"]` inside the States section, `getAttribute`):
  ```
  open          "Open until 10:00 PM"
  opening-soon  "Opens at 5:00 PM"
  closed        "Closed, opens Tuesday at 5:00 PM"
  unset         "No operating hours set"
  ```
  `NeonSign.tsx:33-42` types `"aria-label": string` and `state: NeonSignState` as required props.
- Result: PASS

#### B2. Under `prefers-reduced-motion`: `data-reduced-motion="true"`, no flicker/glow plays, four static frames stay distinct

- Check (pass 2, `66deee3ac`): jsdom cases re-run (A1, targeted 23/23); Chromium on the rebuilt showcase — (a) the hashed `.reduced` class alone under **no** media emulation (the B3 probe; the path the hospitality dashboard depends on), (b) Playwright `emulateMedia({ reducedMotion: 'reduce' })` + reload, reading `data-reduced-motion`, computed `animation-name`, `getAnimations()`, `data-lit`, tube text / visibility on every `[role="img"]` and on the four States rows; then the rebuilt hospitality bundle grepped for the fixed rules and diffed against the rialto dist
- Evidence (pass 2):

  ```
  ✓ NeonSign.test.tsx > NeonSign > reduced motion > flags the reduced-motion branch          (targeted run at 66deee3ac: 3 files, 23/23)
  ✓ NeonSign.motion.test.tsx > NeonSign — animated path (reduced motion off) > does not flag reduced motion and lights the tube in the state the strike keys on
  ```

  Showcase, reduce emulated (`matchMedia('(prefers-reduced-motion: reduce)').matches === true`, 1.5 s after the States section mounted):

  ```
  [role="img"] count 9    data-reduced-motion ["true" ×9]    tube animationName ["none" ×9]    tube getAnimations().length [0 ×9]
  States rows — data-state / aria-label / .reduced on root / data-lit / tube text / visibility / animationName / opacity:
  open          "Open until 10:00 PM"               reduced=true  lit=true   OPEN  visible  none  1
  opening-soon  "Opens at 5:00 PM"                  reduced=true  lit=true   OPEN  visible  none  0.8
  closed        "Closed, opens Tuesday at 5:00 PM"  reduced=true  lit=false  OPEN  visible  none  1
  unset         "No operating hours set"            reduced=true  lit=false  OPEN  hidden   none  1
  ```

  (`animationDuration` still reads `1e-05s` on those four — rialto-web's `global.css:30-38` reset —
  but it is moot now: `animation-name` is `none` from the instrument's own rule, so there is no
  animation left for the reset to shorten.) Class-only path, **no emulation** (`matches === false`),
  full numbers in B3: adding `_reduced_4xynw_166` to the States `open` / `opening-soon` roots flips
  `animationName` strike → `none` and breathe → `none`, `getAnimations()` → `[]`, opening-soon opacity → `0.8`.
  Hospitality bundle, rebuilt at `66deee3ac` (`apps/hospitality/dist/assets/rialto-vendor-D92FT4gy.css`, 22:39):

  ```
  ._neonSign_4xynw_9:where([data-state=open]) ._tube_4xynw_67{color:var(--rialto-success);text-shadow:0 0 2px,0 0 8px;animation:_rialto-neon-strike_4xynw_1 var(--neon-strike) linear 1 both}                               (0,2,0)
  ._neonSign_4xynw_9:where([data-state=opening-soon]) ._tube_4xynw_67{color:var(--rialto-accent);text-shadow:0 0 2px,0 0 8px;animation:_rialto-neon-breathe_4xynw_1 var(--neon-warm-cycle) var(--rialto-ease-smooth) infinite}   (0,2,0)
  ._neonSign_4xynw_9._reduced_4xynw_166 ._tube_4xynw_67{animation:none}                                                                                                                       (0,3,0)
  ._neonSign_4xynw_9._reduced_4xynw_166[data-state=opening-soon] ._tube_4xynw_67{opacity:.8}                                                                                                  (0,4,0)
  @media (prefers-reduced-motion:reduce){._neonSign_4xynw_9[data-state] ._tube_4xynw_67{animation:none}._neonSign_4xynw_9[data-state=opening-soon] ._tube_4xynw_67{opacity:.8}}             (0,3,0)
  old-shape rules in the bundle (`[data-state=open] ._tube` without :where; bare `._reduced_… ._tube`):  0
  grep -o "animation[a-z-]*:[^;}]*!important" apps/hospitality/dist/assets/*.css | wc -l   →  0     (still no host reset — none needed now)
  grep -n "prefers-reduced-motion\|01ms" apps/hospitality/src/index.css                     →  exit 1
  all 11 `_neonSign_4xynw_9` rules, packages/rialto/dist/lib/styles.css vs the hospitality bundle:  diff → identical
  ```

  The dashboard therefore ships exactly the rules the B3 probe exercised in Chromium, where the
  `.reduced` class alone — no host reset, no media query — stopped both animations; the OS media
  query path is covered by the (0,3,0) media twin in the same bundle. The four frames stay distinct.
  Screenshot under emulated reduce (not committed):
  `/private/tmp/claude-501/-Users-mbutler-github-mattbutlerengineering/0b2177c3-482d-404b-9fba-148c79c0c315/scratchpad/neon-sign-states-reduced.png`
  (73 153 bytes, 1624×1054) — olive lit / amber lit at 0.8 / grey dark on the plate / dashed empty
  outline, each captioned with its ux.md label.

  **Pass 1 record (`338703391`, FAIL — kept verbatim):**

- Check: jsdom under the global `useReducedMotion → true` mock and the motion-test inverse; Chromium (showcase) via Playwright `emulateMedia({ reducedMotion: 'reduce' })` + reload, reading `data-reduced-motion`, computed animation longhands and `Element.getAnimations()` on the States tubes, with a no-preference control; then a trace of which stylesheet actually stops the motion and whether `apps/hospitality` ships it
- Evidence:
  ```
  ✓ NeonSign.test.tsx > NeonSign > reduced motion > flags the reduced-motion branch (setup.ts mocks useReducedMotion to true)
  ✓ NeonSign.motion.test.tsx > NeonSign — animated path (reduced motion off) > does not flag reduced motion and lights the tube in the state the strike keys on
  ```
  Showcase, reduce emulated (`matchMedia('(prefers-reduced-motion: reduce)').matches === true`):
  ```
  all 9 [role="img"] data-reduced-motion: ["true" ×9]; `.reduced` class present on each root
  open          animationName _rialto-neon-strike_…  animationDuration "1e-05s"  iterationCount "1"  getAnimations: [{playState:"finished", currentTime:0}]  opacity 1
  opening-soon  animationName _rialto-neon-breathe_… animationDuration "1e-05s"  iterationCount "1"  getAnimations: []                                       opacity 0.8
  closed        animationName none                                                                                                                         opacity 1, tube visible
  unset         animationName none                                                                                                                         tube visibility hidden
  ```
  Control, no-preference, right after reload:
  ```
  open          getAnimations: [{name:_rialto-neon-strike_…, playState:"running", currentTime:492}]  opacity 0.758956
  opening-soon  getAnimations: [{name:_rialto-neon-breathe_…, playState:"running", currentTime:492}] opacity 0.878515
  ```
  The `1e-05s` duration is not the instrument's doing: `animation-name` is still the
  strike/breathe (its `animation: none` rules lost the cascade — B3). What parks the showcase is
  the `!important` reset in **rialto-web's own** stylesheet:
  ```
  apps/rialto-web/src/main.tsx:5:import "@mattbutlerengineering/rialto/styles";
  apps/rialto-web/src/main.tsx:6:import "./global.css";
  apps/rialto-web/src/global.css:30-38  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; } }
  ```
  Rialto's equivalent (`packages/rialto/src/styles/global.css:20-26`) is imported only by the
  package's internal showcase and is **not** part of the published styles:
  ```
  grep -rn "global.css" packages/rialto/src | grep -v .test.   →  src/showcase/main.tsx:4:import "../styles/global.css";   (the only import)
  grep -o "animation-duration:.01ms!important" packages/rialto/dist/lib/styles.css | wc -l   →  0
  ```
  `apps/hospitality` imports `@mattbutlerengineering/rialto/styles` and `./index.css` (`src/main.tsx:1-2`) and ships no reset at all:
  ```
  grep -n "prefers-reduced-motion\|01ms" apps/hospitality/src/index.css                       →  exit 1 (no match)
  grep -o "animation[a-z-]*:[^;}]*!important" apps/hospitality/dist/assets/*.css | wc -l   →  0
  apps/hospitality/dist/assets/rialto-vendor-BC1LJItO.css (the NeonSign rules as shipped):
    ._neonSign_xpiic_9[data-state=open] ._tube_xpiic_67{color:var(--rialto-success);text-shadow:0 0 2px,0 0 8px;animation:_rialto-neon-strike_xpiic_1 var(--neon-strike) linear 1 both}   (0,3,0)
    ._reduced_xpiic_162 ._tube_xpiic_67{animation:none}                                                                                                                                (0,2,0)
    @media (prefers-reduced-motion:reduce){._tube_xpiic_67{animation:none}._neonSign_xpiic_9[data-state=opening-soon] ._tube_xpiic_67{opacity:.8}}                                    (0,1,0)
  ```
  These are the same hashed rules the B3 probe exercised in Chromium, where the (0,3,0) state
  rule kept the strike at `0.9s` and the breathe `running` against them. With nothing of higher
  specificity or `!important` in the hospitality bundle, the dashboard under an OS reduce
  setting shows `data-reduced-motion="true"` and `.reduced` (framer-motion reads the media
  query) while the strike plays on every `open` mount and the breathe loops in `opening-soon` —
  the opposite of the criterion. The four frames do stay distinct in both surfaces (colour
  token, wash, housing, tube visibility — screenshot in C1).
- Pass-1 result: **FAIL** — PASS on the showcase only by virtue of rialto-web's reset (measured); FAIL on the hospitality dashboard by the shipped cascade (deduced from the same rules measured in B3; not rendered live — Auth0). Same root cause as B3. Routed to Implement; fixed by `66deee3ac`.
- Result: **PASS** at `66deee3ac` — measured on the showcase for both paths (class-only with no emulation, and the OS media query); deduced for the hospitality dashboard from its rebuilt bundle, which ships the same 11 rules byte-for-byte and still no reset (not rendered live — Auth0).

#### B3. The instrument's own reduced-motion rules suppress the keyframes (`.reduced .tube { animation: none }` and the `@media` twin, architecture.md § NeonSign props "Reduced motion"; breakdown #4742 "reduced-motion twin")

- Check (pass 2, `66deee3ac`): the same probe on the rebuilt showcase — Chromium, **no** media emulation, 1.5 s after the States section mounted; derive the hashed token from the first stylesheet selector containing both `_neonSign_` and `_reduced_`; `classList.add` on the States `open` and `opening-soon` roots; read computed longhands and `getAnimations()` before, immediately after, and 600 ms later. Plus the new `NeonSign.cascade.test.ts` run RED against the pass-1 CSS and GREEN against HEAD in a scratch harness (no tracked file touched)
- Evidence (pass 2):

  ```
  matchMedia('(prefers-reduced-motion: reduce)').matches  →  false
  naive first /reduced/ selector:  ._reduced_gulba_155 ._pulse_gulba_126                      (Handshake's token — the wrong one)
  reducedToken: "_reduced_4xynw_166"  from  ._neonSign_4xynw_9._reduced_4xynw_166 ._tube_4xynw_67 { animation: auto ease 0s 1 normal none running none; }
  before      open:          class "_neonSign_4xynw_9 _sizeMd_4xynw_34"   animationName _rialto-neon-strike_4xynw_1    duration 0.9s   count 1         getAnimations [{strike,  finished, currentTime 900}]    opacity 1
              opening-soon:  class "_neonSign_4xynw_9 _sizeMd_4xynw_34"   animationName _rialto-neon-breathe_4xynw_1   duration 2.4s   count infinite  getAnimations [{breathe, running,  currentTime 23534}]  opacity 0.642687
  after add   open:          class "… _reduced_4xynw_166"   animationName none   duration 0s   getAnimations []   opacity 1
              opening-soon:  class "… _reduced_4xynw_166"   animationName none   duration 0s   getAnimations []   opacity 0.8
  +600 ms     open:          animationName none   getAnimations []   opacity 1
              opening-soon:  animationName none   getAnimations []   opacity 0.8        (data-reduced-motion still "false" on both — the class alone did it)
  ```

  Static confirmation, `NeonSign.module.css` at `66deee3ac`: `89: .neonSign:where([data-state="open"]) .tube` and
  `106: .neonSign:where([data-state="opening-soon"]) .tube` (0,2,0); `166: .neonSign.reduced .tube { animation: none }` (0,3,0);
  `170: .neonSign.reduced[data-state="opening-soon"] .tube { opacity: 0.8 }` (0,4,0); media block `174-182`:
  `.neonSign[data-state] .tube { animation: none }` (0,3,0) plus the opacity twin. Keyframes untouched — the fix diff
  (`git show 66deee3ac -- …NeonSign.module.css`) changes only selectors and comments (+11/−7 lines).
  Regression guard — `NeonSign.cascade.test.ts` reads the source sheet, computes Selectors-4 specificity (`:where()` → 0),
  and deliberately does not honour `!important`. Shown RED on the old sheet without touching the tree:

  ```
  harness: byte-identical copy of the test (verified with cmp) + `git show 338703391:…/NeonSign.module.css` saved as NeonSign.module.css,
           run with `pnpm --dir packages/rialto exec vitest run --dir <scratch> --reporter=verbose` (rialto's own vitest config)
  RED  (pre-fix CSS)   exit=1   Test Files  1 failed (1)   Tests  2 failed | 2 passed (4)
    × useReducedMotion() → .reduced rules beat every animated tube rule on specificity alone
      AssertionError: ".reduced .tube" (0,2,0) must have strictly greater specificity than ".neonSign[data-state="open"] .tube" (0,3,0) — otherwise its animation: none loses and the rialto-neon-strike plays under reduced motion: expected false to be true
    × @media (prefers-reduced-motion: reduce) rules beat every animated tube rule on specificity alone
      AssertionError: @media (prefers-reduced-motion: reduce) ".tube" (0,1,0) must have strictly greater specificity than ".neonSign[data-state="open"] .tube" (0,3,0) — otherwise its animation: none loses and the rialto-neon-strike plays under reduced motion: expected false to be true
  GREEN (HEAD CSS, same harness)   exit=0   Test Files  1 passed (1)   Tests  4 passed (4)
  GREEN (in tree, A1)              exit=0   Tests  4 passed (4)
  ```

  The two RED assertions name exactly the pass-1 defect (class path (0,2,0) < (0,3,0); media path
  (0,1,0) < (0,3,0)). framer-motion's `MotionConfig reducedMotion="always"` (ux.md's supported
  override) drives `useReducedMotion()` → `.reduced`, i.e. the class path just measured; it was not
  separately exercised.

  **Pass 1 record (`338703391`, FAIL — kept verbatim):**

- Check: Chromium, no-preference, 1.5 s after reload; read the hashed class from the stylesheet and add it to the States `open` and `opening-soon` roots via `classList.add`; read computed longhands and `getAnimations()` before, immediately after, and 600 ms later
- Evidence:
  ```
  reducedClass: "_reduced_xpiic_162"
  rule text: ._reduced_xpiic_162 ._tube_xpiic_67 { animation: auto ease 0s 1 normal none running none; }   ← specificity (0,2,0)
  state rules: .neonSign[data-state="open"] .tube { … animation: rialto-neon-strike … }                      ← specificity (0,3,0)  (NeonSign.module.css:87-96, 104-110)
  before      open: animationDuration "0.9s"  opening-soon: animationDuration "2.4s", breathe running, opacity 0.63153
  after add   open: classes "_neonSign_xpiic_9 _sizeMd_xpiic_34 _reduced_xpiic_162", animationName _rialto-neon-strike_…, animationDuration "0.9s"
              opening-soon: classes "… _reduced_xpiic_162", animationName _rialto-neon-breathe_…, animationDuration "2.4s", getAnimations: [{playState:"running"}]
  +600 ms     opening-soon: breathe still running, currentTime 2600, opacity 0.68829   (open strike: finished, currentTime 900)
  ```
  Static confirmation, `NeonSign.module.css:160-178`: `.reduced .tube` and the media-block `.tube`
  (0,1,0) both set `animation: none`, while every animating selector is
  `.neonSign[data-state="…"] .tube` (0,3,0). Only the `opacity: 0.8` rules win (same specificity,
  later in source — which is why the parked opacity is correct while the animation is not stopped).
  jsdom cannot see keyframes (architecture.md acknowledges this), so `NeonSign.test.tsx` passes while
  the class does nothing to the motion. Consequence: the instrument has no working reduced-motion
  mechanism of its own — not for the OS media query (either via `.reduced` or the `@media` twin)
  and not for framer-motion `MotionConfig reducedMotion="always"`, which ux.md names as the
  supported override. It only appears to work where the host app carries its own `!important`
  reset (rialto-web does; hospitality does not — trace in B2). The sibling instruments ship the
  same shape (`._reduced_gulba_155 ._pulse_gulba_126{animation:none;…}` in the hospitality bundle
  for `Handshake`; `WatchLoader.module.css:228-234`), but whether their state selectors outrank it
  was not measured here.
- Pass-1 result: **FAIL** (the mechanism behind B2's dashboard failure). Route: Implement — raise the
  reduced rules above (0,3,0), e.g. `.neonSign.reduced[data-state="open"] .tube, .neonSign.reduced[data-state="opening-soon"] .tube { animation: none; }` plus the media twin, or `!important` on the two `animation: none` declarations; add a browser-level or specificity-level assertion so the class path cannot silently regress again. — Fixed by `66deee3ac` (the `:where()` route: state rules lowered to (0,2,0), reduced rules raised to (0,3,0)/(0,4,0), no `!important`; guard = `NeonSign.cascade.test.ts`).
- Result: **PASS** at `66deee3ac` — both reduced-motion paths measured in Chromium (class-only: strike and breathe → `animation-name: none`, `getAnimations()` `[]`, opening-soon parked at `0.8`; emulated media: 9/9 tubes `none`, 0 running) and guarded by a test demonstrated RED on the pass-1 sheet.

#### B4. Gold only in `opening-soon`; `open` uses the success token; `closed`/`unset` neutral and distinct; tokens only, no colour literals

- Check: `grep -n "rialto-accent" NeonSign.module.css` with the enclosing selectors; `grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(" NeonSign.module.css`; `sed -n '85,126p'` (re-run at `66deee3ac`; line numbers below are the new ones, +2 from pass 1 — the fix diff adds two comment lines and touches no declaration)
- Evidence:
  ```
  107:  color: var(--rialto-accent);              inside 106: .neonSign:where([data-state="opening-soon"]) .tube { … }
  115:  background: var(--rialto-accent-muted);   inside 114: .neonSign[data-state="opening-soon"] .housing::before { … }
  (those are the only two `rialto-accent` hits — still only inside the opening-soon block)
  colour-literal grep: exit=1 (no matches)
  open block 89-…: color: var(--rialto-success);  (open tube)   wash: background: var(--rialto-success-muted)
  .tube default 67-77: color: var(--rialto-border)  (closed)      57-58: .housing::before { content: ""; … }
  120: .neonSign[data-state="unset"] .housing { background: transparent; border-style: dashed; box-shadow: none; }   126: .neonSign[data-state="unset"] .tube { visibility: hidden; }
  ```
  Screenshots (C1 default; B2 reduced) show olive lit / amber lit / grey dark tube on plate / dashed empty outline.
- Result: PASS

#### B5. Motion on the compositor (opacity keyframes only); no JS timers; no `useEffect`/`useState` in the component

- Check: `grep -n "useEffect\|useState" packages/rialto/src/components/NeonSign/NeonSign.tsx`; keyframe bodies; strike binding (re-run at `66deee3ac`; line numbers +2 from pass 1, keyframes byte-unchanged per the fix diff)
- Evidence:
  ```
  grep exit=1 (no useEffect/useState in NeonSign.tsx; the component is a pure forwardRef render, NeonSign.tsx:49-87)
  97:  animation: rialto-neon-strike var(--neon-strike) linear 1 both;   inside 89: .neonSign:where([data-state="open"]) .tube
  111: animation: rialto-neon-breathe var(--neon-warm-cycle) var(--rialto-ease-smooth) infinite;   inside 106: .neonSign:where([data-state="opening-soon"]) .tube
  131: @keyframes rialto-neon-strike  { 0% opacity 0; 15% 1; 30% 0.3; 45% 1; 65% 0.5; 80%,100% 1 }   (three dips, as ux.md bounds)
  153: @keyframes rialto-neon-breathe { 0%,100% opacity 0.6; 50% 1 }
  ```
  Browser (pass 2, no emulation, B3 "before" read): the `open` tube's computed `animation-name` is
  `_rialto-neon-strike_4xynw_1` (0.9 s, finished at currentTime 900 by the 1.5 s read) and the breathe is
  `running` on `opening-soon` (2.4 s, infinite) — the strike is bound to the state attribute, not to React.
- Result: PASS

#### B6. a11y matrix passes with a `NeonSign` fixture

- Check: `pnpm --dir packages/rialto test -- --run src/test/accessibility/a11y-matrix.test.tsx -t NeonSign --reporter=verbose`; list/fixture greps
- Evidence:
  ```
  ✓ src/test/accessibility/a11y-matrix.test.tsx > Accessibility — component matrix > NeonSign 76ms
  Tests  1 passed | 88 skipped (89)
  a11y-matrix.test.tsx:81:  "NeonSign",
  component-fixtures.tsx:75:import { NeonSign } from "../../components/NeonSign/NeonSign";
  component-fixtures.tsx:175:  | "NeonSign"
  component-fixtures.tsx:582:    element: <NeonSign state="open" aria-label="Open until 10:00 PM" />,
  ```
  Coverage guard ("every barrel component has either a fixture or an explicit skip entry",
  `a11y-matrix.test.tsx:119-128`) is green in the full run (A1). The "red without the entry" half
  of breakdown #4743's AC is NOT VERIFIED (would require editing a test file).
- Result: PASS

#### B7. A Storybook story shows all four states

- Check: `grep -nE "title:|export const|play|aria-label|state=" NeonSign.stories.tsx`
- Evidence:
  ```
  6:  title: "Data Display/NeonSign",
  28:export const Default   35:export const AllStates   46:export const Sizes   56:export const WithoutCaption
  38-41: <NeonSign state="open" …"Open until 10:00 PM"/>, state="opening-soon" "Opens at 5:00 PM", state="closed" "Closed, opens Tuesday at 5:00 PM", state="unset" "No operating hours set"
  (no `play` match)
  ```
  Note: `packages/rialto/tsconfig.json:12` excludes `**/*.stories.tsx`, so `pnpm typecheck` does
  not cover the story; prd.md's "typechecks" clause is covered only by `eslint .` (A1, 0 errors).
- Result: PASS (presence + four states); story typecheck NOT VERIFIED by tsc (see Not verified)

#### B8. `.changeset/*.md` marks `@mattbutlerengineering/rialto` minor

- Check: `cat .changeset/neon-sign-instrument.md`
- Evidence:
  ```
  ---
  "@mattbutlerengineering/rialto": minor
  ---
  **New `NeonSign` instrument** — …
  ```
- Result: PASS

#### B9. Instrument contract details (breakdown #4742): tube `[data-tube]` prints OPEN, `data-lit` only for open/opening-soon, tube stays in DOM in `unset`, housing + caption `aria-hidden`, `showCaption` default true, `sizeSm|Md|Lg`, `className`/`ref`/rest forwarded

- Check: NeonSign verbose case list; `NeonSign.tsx:74-83`
- Evidence:
  ```
  ✓ structure > hides the housing and the caption from assistive tech
  ✓ structure > prints the accessible name as the caption by default
  ✓ structure > drops the caption on request without touching the accessible name
  ✓ state > the tube always spells OPEN (open|opening-soon|closed|unset)   (4 cases)
  ✓ state > lights the tube only while open or opening soon
  ✓ state > keeps the tube in the DOM when hours are unset so the footprint never changes
  ✓ size > applies md by default   ✓ size > applies sm and lg presets
  ✓ className, ref and rest > forwards className, ref and extra attributes to the root
  ```
  Browser: every sign's `tubeText` is `"OPEN"`; `data-lit` `"true"` for open/opening-soon, `"false"`
  for closed/unset; `unset` tube `visibility: hidden` yet present.
- Result: PASS

#### B10. `./NeonSign` in `package.json` exports, `NeonSign` in `registry.json`, barrel export

- Check: greps
- Evidence:
  ```
  packages/rialto/package.json:233:    "./NeonSign": {  234: "types": "./dist/lib/components/NeonSign/index.d.ts",  235: "import": "./dist/lib/components/NeonSign/index.js"
  packages/rialto/registry.json:2738:      "name": "NeonSign",
  packages/rialto/src/components/index.ts:98:export * from "./NeonSign";
  ```
- Result: PASS

### C. Showcase (`apps/rialto-web`)

#### C1. `NeonSign` page reachable through `page-registry.ts` (Data Display) and demonstrates all four states

- Check: `page-registry.ts:119` derives `/components/${entry.id}`; served the built showcase (`pnpm --dir apps/rialto-web exec vite preview --port 5199 --strictPort`, base `/rialto/` per `vite.config.ts:7`); Playwright `goto http://localhost:5199/rialto/components/neon-sign`; DOM read; screenshot of the States section
- Evidence:
  ```
  apps/rialto-web/src/data/page-registry.ts:178:  { id: "neon-sign", label: "Neon Sign", category: "Data Display" },
  curl -sI http://localhost:5199/rialto/components/neon-sign | head -1  →  HTTP/1.1 200 OK
  Page Title: Neon Sign — Rialto   h1: "Neon Sign"   [role="img"] count: 9 (1 replay, 4 States, 1 playground, 3 sizes)
  States section imgs: open / opening-soon / closed / unset with the four aria-labels quoted in B1; data-reduced-motion "false" ×9 under default settings
  ✓ src/data/page-registry.test.ts > PageRegistry — load factories > every load() resolves without throwing
  ✓ src/hooks/manifest-drift.test.ts > manifest drift guard — data category > manifest contains props for data component: NeonSign
  apps/rialto-web/src/data/page-registry.test.ts:58:vi.mock("../pages/data/NeonSignPage.js", …)   manifest-drift.test.ts:212:  "NeonSign",
  ```
  Screenshot (not committed): `/private/tmp/claude-501/-Users-mbutler-github-mattbutlerengineering/0b2177c3-482d-404b-9fba-148c79c0c315/scratchpad/neon-sign-states.png` (74 153 bytes) — four rows, each labelled, olive/amber/grey/dashed as designed.
- Result: PASS

#### C2. Six sections with the exact titles (breakdown #4744)

- Check: browser `h2` texts; `grep -n 'Section title=' NeonSignPage.tsx`
- Evidence:
  ```
  headings: ["Service Day Replay", "States", "Playground", "Sizes", "Props", "Accessibility"]
  NeonSignPage.tsx:108,115,129,136,150,155  <Section title="…">  (same six)
  ```
- Result: PASS

#### C3. Replay phase table `closed ×2, opening-soon ×2, open ×3` at 1 200 ms with cleanup; `open` picker bumps `replayNonce` keying the sign; `PropsTable component="NeonSign"`; Accessibility `DataList`

- Check: `grep -nE 'replayNonce|PropsTable|setInterval|1200|"closed"|"opening-soon"|"open"|DataList' NeonSignPage.tsx`
- Evidence:
  ```
  29-35: "closed","closed","opening-soon","opening-soon","open","open","open"     37: const REPLAY_TICK_MS = 1200;
  55: const t = setInterval(() => setStep((s) => (s + 1) % REPLAY_PHASES.length), REPLAY_TICK_MS);
  79: if (next === "open") setReplayNonce((n) => n + 1);   84: <NeonSign key={replayNonce} state={state} … size="lg" />
  151: <PropsTable component="NeonSign" />   156: <DataList …  (Accessibility section)
  ```
  The six DataList rows were not compared verbatim against ux.md (see Not verified).
- Result: PASS

#### C4. Not added to either visual suite

- Check: `git diff --stat origin/main HEAD -- packages/rialto/src/test/visual/visual.spec.ts apps/rialto-web/e2e/visual.spec.ts`; `grep -n "NeonSign\|neon-sign"` in both
- Evidence:
  ```
  (diff prints nothing — 0 lines; both files untouched)
  grep exit=1 (no NeonSign / neon-sign in either spec)
  ```
- Result: PASS

### D. Derivation (`apps/hospitality`, pure function) — `pnpm --dir apps/hospitality test -- --run src/utils/venueOpenState.test.ts --reporter=verbose` → `Tests  38 passed (38)`, exit 0

#### D1. Uses `Venue.ianaTimezone`, never the browser zone

- Evidence: `✓ deriveVenueOpenState > time zone > reads the venue zone, not the machine zone`
- Result: PASS

#### D2. Overnight window: open at 01:00 next day (Saturday closed or missing), closed at 03:00; evening side; overlap precedence

- Evidence:
  ```
  ✓ open > spills Friday's overnight window into Saturday 01:00 when Saturday is closed
  ✓ open > spills Friday's overnight window into Saturday 01:00 when Saturday is missing
  ✓ open > is not open once the overnight spill has closed
  ✓ open > is open on the evening side of an overnight window
  ✓ open > lets today's window win when it overlaps yesterday's overnight spill
  ```
- Result: PASS

#### D3. `closed: true` and missing days are closed; next-opening skips them; wraps to same weekday

- Evidence:
  ```
  ✓ closed > opens later today   ✓ closed > skips a day marked closed   ✓ closed > skips missing days   ✓ closed > wraps to the same weekday next week
  ```
- Result: PASS

#### D4. DST spring-forward and fall-back in `America/Los_Angeles`

- Evidence:
  ```
  ✓ DST > spring-forward (2026-03-08, 02:00 PST → 03:00 PDT) > is closed until 09:00 at 01:30 PST
  ✓ DST > spring-forward (…) > is closed until 09:00 at 03:30 PDT
  ✓ DST > spring-forward (…) > is open inside a 01:00–05:00 window at 01:30 PST
  ✓ DST > spring-forward (…) > is open inside a 01:00–05:00 window at 03:30 PDT
  ✓ DST > fall-back (2026-11-01, 02:00 PDT → 01:00 PST) > is closed until 10:00 at 01:30 PDT
  ✓ DST > fall-back (…) > is closed until 10:00 at 01:30 PST
  ```
- Result: PASS

#### D5. Half-open interval `[open, close)`

- Evidence: `✓ open > is open mid-window with the closing time` · `✓ open > treats the window as half-open [open, close)`
- Result: PASS

#### D6. `opening-soon` at 59 min, `closed` at 61 (and the inclusive 60, across midnight, custom lead)

- Evidence:
  ```
  ✓ opening-soon > at 16:01 (59 minutes before a 17:00 opening) is opening-soon
  ✓ opening-soon > at 16:00 (60 minutes before a 17:00 opening) is opening-soon
  ✓ opening-soon > at 15:59 (61 minutes before a 17:00 opening) is closed
  ✓ opening-soon > counts the lead across midnight   ✓ opening-soon > honours a shorter openingSoonMinutes
  ```
- Result: PASS

#### D7. `unset` exactly when no valid non-closed day remains, matching `hasOperatingHours`

- Evidence:
  ```
  ✓ unset > is unset for null, agreeing with hasOperatingHours
  ✓ unset > is unset for undefined, agreeing with hasOperatingHours
  ✓ unset > is unset for an empty object, agreeing with hasOperatingHours
  ✓ unset > is unset for every configured day closed, agreeing with hasOperatingHours
  ✓ unset > is unset when the only non-closed days are malformed (diverging from hasOperatingHours)
  ```
- Result: PASS

#### D8. Malformed entries ignored per day, never throw; unrecognised zone reported (`null`), never guessed

- Evidence:
  ```
  ✓ malformed days > skips a Monday with hour 25 and names Tuesday
  ✓ malformed days > skips a Monday with 12-hour text and names Tuesday
  ✓ malformed days > skips a Monday with unpadded digits and names Tuesday
  ✓ malformed days > skips a Monday with a malformed close and names Tuesday
  ✓ malformed days > skips a Monday with open equal to close and names Tuesday
  ✓ time zone > returns null without throwing for the unusable zone "Mars/Olympus" | "" | undefined | null   (4 cases)
  ```
- Result: PASS

#### D9. Input not mutated (breakdown #4738)

- Evidence: `✓ deriveVenueOpenState > does not mutate the input hours`
- Result: PASS

#### D10. Label copy (breakdown #4739): the five ux.md strings incl. overnight; `WEEKDAY_LABEL`; no `Intl`/`new Date` in `venueOpenLabel.ts`

- Check: targeted run `--reporter=verbose`; `grep -n "Intl\|new Date" apps/hospitality/src/utils/venueOpenLabel.ts`
- Evidence:
  ```
  ✓ formatVenueOpenLabel > names the closing time when open
  ✓ formatVenueOpenLabel > names an early-morning closing time for an overnight window
  ✓ formatVenueOpenLabel > names the opening time when opening soon
  ✓ formatVenueOpenLabel > says when it opens later today when closed
  ✓ formatVenueOpenLabel > names the weekday when the next opening is another day
  ✓ formatVenueOpenLabel > uses the product's existing phrase when hours are unset
  ✓ WEEKDAY_LABEL > covers all seven weekdays with capitalised names
  grep exit=1 (no Intl / new Date)
  ```
  The exact strings are confirmed end-to-end in the browser and HomePage tests
  (`Open until 10:00 PM`, `Opens at 5:00 PM`, `Closed, opens at 5:00 PM`, `Closed, opens Tuesday at 5:00 PM`, `No operating hours set`).
- Result: PASS

#### D11. `formatLocalTime` (breakdown #4739): 17:00→5:00 PM, 22:00→10:00 PM, 02:00→2:00 AM, 00:00→12:00 AM, 12:30→12:30 PM; existing `formatTime` cases unchanged

- Evidence:
  ```
  ✓ formatLocalTime > formats 17:00 as 5:00 PM   ✓ … 22:00 as 10:00 PM   ✓ … 02:00 as 2:00 AM   ✓ … 00:00 as 12:00 AM   ✓ … 12:30 as 12:30 PM
  ✓ formatTime > formats an ISO datetime string to 12-hour time with minutes  (+3 existing formatTime cases green)
  ```
  The `TZ=Asia/Tokyo` invariance sub-clause was not run under a foreign `TZ` (see Not verified).
- Result: PASS

### E. Dashboard consumer (`apps/hospitality`) — targeted run `Test Files  5 passed (5)   Tests  58 passed (58)`, exit 0

#### E1. `HomePage` renders the sign from `useVenue().selectedVenue` in the header region; four states reachable; no venue → no sign; unusable zone → no sign

- Check: `HomePage.test.tsx` verbose cases; `HomePage.tsx:32-57`
- Evidence:
  ```
  ✓ HomePage > neon sign in the header aside > renders an open sign inside the header while the venue is trading
  ✓ … > renders an opening-soon sign inside the lead window before opening
  ✓ … > renders a closed sign naming today's opening time
  ✓ … > renders an unset sign when the venue has no operating hours
  ✓ … > renders no sign and today's header when no venue is selected
  ✓ … > renders no sign when the venue's timezone is unusable
  HomePage.tsx:32 const { selectedVenue } = useVenue();  33 const now = useNow();  35-41 deriveVenueOpenState({…, now})  52-56 aside={openState && <NeonSign state={openState.state} aria-label={formatVenueOpenLabel(openState)} />}
  ```
  `grep -n "useEffect\|useState" apps/hospitality/src/pages/HomePage.tsx` → exit 1 (render-time derivation, no local state).
- Result: PASS (unit level; live dashboard NOT VERIFIED — Auth0)

#### E2. Label changes as time passes without a reload (≥ once a minute)

- Evidence:
  ```
  ✓ HomePage > neon sign in the header aside > re-derives the state on the minute tick without a reload
    (HomePage.test.tsx:354 data-state "opening-soon" → :360 getByRole("img", { name: "Open until 10:00 PM" }) after advancing 60 000 ms)
  ```
- Result: PASS

#### E3. Existing `HomePage.test.tsx` cases pass; `dashboard.spec.ts` selectors stay unique (no new `heading`/`status`/`meter`, no "Dashboard"/"Live Activity" text)

- Evidence:
  ```
  11 pre-existing HomePage cases green (renders the dashboard page header with user name … navigation buttons call navigate with correct paths)
  HomePage.test.tsx:295 getByRole("heading", { name: "Dashboard" }) still unique; :296 queryByRole("status") null; :297 queryByRole("meter") null
  dashboard.spec.ts selectors (8,20-28,36,43-45,62-65) use heading "Dashboard", status inside labelled tiles, meter "Cancellation Rate", text "Live Activity", buttons — none selects role="img" or the caption text
  git diff --stat origin/main HEAD -- apps/hospitality/e2e → 0 lines (spec frozen)
  ```
- Result: PASS (unit level; the advisory E2E run is NOT VERIFIED)

#### E4. `useNow` (breakdown #4740): initial = mocked time; same object at 59 999 ms; new Date at 60 000; custom interval; restart keeps one timer; 0 timers after unmount; `setNow` only in the interval callback

- Evidence:
  ```
  ✓ useNow > returns the current time on first render
  ✓ useNow > returns the same object until the first minute has elapsed
  ✓ useNow > yields a fresh Date at the advanced time after one minute
  ✓ useNow > ticks at a custom interval
  ✓ useNow > restarts with a single timer when the interval changes
  ✓ useNow > clears its interval on unmount
  useNow.ts:15-18  useEffect(() => { const interval = setInterval(() => setNow(new Date()), intervalMs); return () => clearInterval(interval); }, [intervalMs]);
  ```
- Result: PASS

#### E5. `PageHeader.aside` (breakdown #4741): aside inside `.aside` with root `withAside` when provided, neither when omitted, five existing cases untouched, no colour literal / accent / warning token

- Evidence:
  ```
  ✓ PageHeader > renders the aside at the inline-end when provided   ✓ PageHeader > adds no aside wrapper when omitted   (+5 existing cases green)
  PageHeader.module.css diff: +.withAside { display:flex; justify-content:space-between; align-items:flex-start; gap: var(--rialto-space-md); flex-wrap: wrap }  +.aside { flex: 0 0 auto }  +@media (max-width: 767px) { .aside { flex-basis: 100% } }
  grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(|rialto-accent|rialto-warning" PageHeader.module.css → exit 1
  ```
- Result: PASS

#### E6. `apps/hospitality/CLAUDE.md` notes the sign on `HomePage`

- Evidence: `apps/hospitality/CLAUDE.md:23:| HomePage | \`/\` | Dashboard landing; \`NeonSign\` header instrument |`
- Result: PASS

### F. Repo and brief constraints

#### F1. Untouched surfaces (brief § scope Out / breakdown Notes): `WatchLoader/**`, `apps/rialto-web/src/pages/auth/**`, `LoginGate`/`CallbackPage`/`SessionExpiredGate`/`App.tsx`, `apps/hospitality/e2e`, `apps/rialto-web/e2e`, `services`, `visual.spec.ts`, `pnpm-lock.yaml` — plus `venue-onboarding/**`, `floor-plan/**`, `packages/types`, `infrastructure`, `.changeset/config.json`

- Check: `git diff --stat origin/main HEAD -- <those paths>`
- Evidence:
  ```
  (first list) prints nothing — 0 lines
  (second list) prints nothing — 0 lines
  ```
  The diff is **empty** for every constrained path.
- Result: PASS

#### F2. No new dependency in any `package.json`

- Check: `git diff origin/main HEAD -- '**/package.json' package.json | grep '^[+-] *"'`
- Evidence:
  ```
  +    "./NeonSign": {
  +      "types": "./dist/lib/components/NeonSign/index.d.ts",
  +      "import": "./dist/lib/components/NeonSign/index.js"
  ```
  The only `package.json` hunk is the generated exports-map entry in `packages/rialto/package.json`; no `dependencies`/`devDependencies` line changed; `pnpm-lock.yaml` untouched (F1).
- Result: PASS

#### F3. The 8 feature commits each carry their `Closes #N` trailer (#4738–#4745)

- Check: `git log --format='COMMIT %h %s%n%b' 1d6189203..HEAD | grep -E '^COMMIT|Closes #'`
- Evidence:
  ```
  83d0dfbde feat(hospitality): show the NeonSign trading state in the dashboard header      Closes #4745
  467e979aa feat(rialto-web): add the NeonSign showcase page under Data Display              Closes #4744
  3aa1d8713 feat(rialto): register NeonSign in the a11y matrix and add its Storybook story   Closes #4743
  72a83bfb0 feat(rialto): add NeonSign, a neon OPEN sign instrument for venue trading state  Closes #4742
  ef4ce743b feat(hospitality): add an aside slot to PageHeader                                Closes #4741
  bef9fd56f feat(hospitality): add useNow, a 60 s clock hook for the dashboard                Closes #4740
  e8e5785ca feat(hospitality): format the venue open-state caption and accessible name        Closes #4739
  3110a3cad feat(hospitality): derive venue open state from operating hours                   Closes #4738
  ```
  (The other `Closes` lines in the range belong to merged-in `auth-handshake-flows` commits.)
  Re-run at `66deee3ac`: the eight trailers are unchanged; the ninth commit on the branch is the
  Implement fix and carries `Refs #4742` rather than a `Closes` (that issue is already closed by
  `72a83bfb0`'s trailer at merge time):
  ```
  66deee3ac fix(rialto): let NeonSign's reduced-motion rules win the cascade                  Refs #4742
  ```
- Result: PASS

#### F4. PR to `main`, `CI Gate` green, Review leaves no unfixed critical finding

- Check: none possible from this stage — no PR exists yet; Review has not run.
- Result: NOT VERIFIED (belongs to Ship/Review; recorded so it is not read as covered)

## Failures

None at `66deee3ac` (pass 2).

Pass 1 (`338703391`) recorded two — B3 (the instrument's reduced-motion rules never won the
cascade: `.reduced .tube` (0,2,0) and the media-block `.tube` (0,1,0) vs
`.neonSign[data-state="open"|"opening-soon"] .tube` (0,3,0)) and B2 (the hospitality dashboard
ships those rules with no host reset, so a reduced-motion user got `data-reduced-motion="true"`
and the flicker anyway) — one root cause, routed to Implement. The fix landed as `66deee3ac`
and pass 2's acceptance evidence is exactly what pass 1 asked for: with `.reduced` alone,
`animation-name` reads `none` and `getAnimations()` returns nothing running (B3), and the
rebuilt hospitality bundle carries the same rules (B2). The pass-1 failure text is retained
verbatim inside the B2 and B3 rows and summarised in the Pass history table.

## Not verified

- **Live hospitality dashboard** — needs Auth0 sign-in; not rendered in either pass. Covered only by
  `HomePage.test.tsx` (E1–E3), which stubs `@mattbutlerengineering/rialto` (the real instrument is
  proved by rialto's tests, the a11y matrix and the showcase render in C1). Its reduced-motion
  behaviour (B2) is deduced from the rebuilt bundle's CSS — byte-identical to the rules measured
  on the showcase — not observed on the dashboard itself.
- **The four `origin/main` commits past the merge-base** (`500affc76`; #4766–#4769, none touching
  NeonSign/hospitality dashboard paths by title) — not in HEAD, not built or tested here; the
  branch picks them up at PR time and `CI Gate` (F4) is where that combination is verified.
- **`MotionConfig reducedMotion="always"`** (ux.md's supported override) — not exercised as such;
  it drives the same `useReducedMotion()` → `.reduced` class path that B3 measured directly.
- **Root typecheck cold** — A5 at `66deee3ac` was a 48/48 turbo cache hit; a cold run was not forced.
- **Advisory `Hospitality E2E` (`apps/hospitality/e2e/dashboard.spec.ts`)** — not run: no `E2E_*`
  variables in this shell (`printenv | grep -E '^E2E_'` → none) and the suite is outside the run's
  scope; the spec file is untouched (F1). Recorded as "environment unavailable" per breakdown #4745.
- **Deployed demo venue's `operatingHours` / `ianaTimezone`** — the inherited UNKNOWN; nothing in the
  repo can read it. If unset in production the live header shows `unset` or no sign.
- **F4** — PR / `CI Gate` / Review outcome (no PR yet).
- **a11y coverage guard "red without the entry"** (breakdown #4743) — proving the negative would
  mean editing `a11y-matrix.test.tsx`; only the positive half (guard green with the entry) is shown.
- **Story typecheck** — `packages/rialto/tsconfig.json:12` excludes `**/*.stories.tsx`, so A1's
  `tsc --noEmit` never saw `NeonSign.stories.tsx`; it passed `eslint .` only. No storybook tsconfig
  was found to run instead.
- **`formatLocalTime` under `TZ=Asia/Tokyo`** (breakdown #4739 sub-clause) — the five cases ran under
  the machine zone only; the implementation pins `timeZone: "UTC"` per architecture.md but the
  foreign-`TZ` run was not executed.
- **Showcase Accessibility `DataList` rows verbatim from ux.md** and the intro sentence — presence
  of the `DataList` confirmed (C3); the six strings were not diffed against ux.md.
- **Sibling instruments (`Handshake`, `WatchLoader`) for the same specificity defect** — the same
  `.reduced .x { animation: none }` shape ships in their CSS (`._reduced_gulba_155 ._pulse_gulba_126`
  is still the first `/reduced/` selector in the showcase sheet); whether their state selectors
  outrank it was not measured in either pass. Out of this run's scope; flagged for Review.

(Pass 1's "reduced-motion screenshot not captured" gap is closed: B2 now cites the emulated-reduce
States screenshot.)

## Verdict

**PASS at `66deee3ac` — 40 of 41 criteria pass with quoted evidence; 0 fail; F4 (PR / `CI Gate` /
Review) remains NOT VERIFIED because no PR exists yet.** Pass 1's two failures (B2, B3) are
cleared by the Implement fix: the instrument's reduced-motion rules now outrank its state
animations on specificity alone, measured in Chromium on the rebuilt showcase with no media
emulation (class-only: strike and breathe → `animation-name: none`, `getAnimations()` `[]`,
opening-soon parked at `0.8`) and under emulated reduce (9/9 signs `data-reduced-motion="true"`,
9/9 tubes `none`, 0 running); the rebuilt hospitality bundle ships the identical rules with no
host reset needed; and `NeonSign.cascade.test.ts` fails on the pass-1 sheet with the exact
specificity assertion and passes on HEAD. Every gate is green at the new HEAD. The
partial-verification caveats above (live dashboard behind Auth0, advisory E2E, deployed venue
hours, story typecheck, the four newer `origin/main` commits) stand. Next stage: Review.
