---
stage: decompose
run: feature:hospitality-animations
date: 2026-08-30
tracking: "#4746"
assumptions:
  - "Eight items in four milestones, with regeneration folded into the causing items — rialto build artifacts (`package.json` exports, `registry.json`) and `packages/rialto/llms*.txt` in #4742, `apps/rialto-web/llms*.txt` in #4744, `apps/hospitality/llms*.txt` in #4745 — rather than a fifth regen milestone. A regen-only item has nothing to test and would leave a permanently dirty tree between sittings."
  - "`formatLocalTime` is folded into the label item (#4739), not the derivation item: the label is its only caller and it lives in `format.ts`, which #4738 never touches, so #4738 stays at two new files."
  - "#4739 is created without `ready`: it type-imports `VenueOpenState` / `Weekday` from `venueOpenState.ts`, so a fallback worker branching from `main` would fail typecheck without #4738 merged. Serial execution makes this moot; the label protects the fallback path."
  - "Rialto is split into the component (+ changeset + build artifacts, #4742) and the a11y-matrix entry + story (#4743). No barrel-vs-list sync test exists in `packages/rialto` (measured: `a11y-matrix.test.tsx:118-143` guards only names already in its own list), so the split leaves no red state between the two. The changeset stays with the component because the brief requires one per `packages/rialto/src` change."
  - "#4744 adds the `page-registry.test.ts` mock line by that file's convention (one `vi.mock` per registry page, `:16-60`); the architecture's change surface omits it (see Design gaps)."
  - "The `PageHeader` slot sits in M1 as a parallel-safe leaf rather than with the HomePage wiring, so M4 is a single six-line composition with every seam already merged."
  - "`useNow` (#4740) is a hospitality hook, so rialto's setState-in-useEffect ban does not apply; the issue still pins `setNow` to the interval callback only, never the effect body."
  - '`content: ""` on `.housing::before` is included in #4742''s CSS spec as an implied necessity — the architecture''s CSS block omits it and a pseudo-element without `content` does not render (see Design gaps).'
  - "No dedicated `NeonSignPage.test.tsx` is required by #4744: `HandshakePage` has none (only `TapeChartPage.test.tsx` exists under `pages/data/`). The RED tests for the item are `page-registry.test.ts › every load() resolves without throwing` and the manifest drift guard."
  - "Fixture instants in #4745 (`2026-08-31T23:59:30Z` = Mon 16:59:30 PDT with a 17:00–22:00 `America/Los_Angeles` venue) are guidance, not contract; any instant that produces each state is acceptable."
  - "Every issue carries `model: sonnet` / `budget: 1.00` and no `priority:*`, `size:*`, or `tier:*` labels, matching the house `/decompose` issues (#4722 et al.). Titles follow the brief: children `[Feature] hospitality-animations [n/8]: …`, tracking `[tracking] hospitality-animations: …`."
  - "Blocked issues carry both `Blocked by:` (tracker mirror) and `Depends on:` (the line `implement-queue-worker` reads); the sets are identical in every case. Ready-now set: #4738, #4740, #4741, #4742."
  - "The execution-model paragraph in every child (serial on `worktree-hospitality-animations`, one PR, `Closes #N` commit trailers, `ready` → `in-progress` → `has-pr` flips) is the orchestrator's instruction and replaces #4722's 'Commit and PR' paragraph; the per-issue fallback flow is retained verbatim for `/implement-queue`."
  - "Recommended serial order is numeric 1 → 8; every dependency edge points forward, and #4743 / #4744 / #4745 are pairwise disjoint once #4742 lands."
surfaced:
  - "UNKNOWN — needs human input: the deployed demo venue's `operatingHours` and `ianaTimezone` (inherited from the architecture's Unknowns). If unset in production the live dashboard shows the `unset` sign — correct, but not the lit demo the idea describes. Set via the dashboard venue settings before Verify; nothing in this repo can read or set them. Recorded as the tracking issue's Human step."
  - "Whether the advisory `Hospitality E2E` job is runnable on Verify day is unknown from this tree; `apps/hospitality/e2e/dashboard.spec.ts` is frozen by the brief, so the header sign has unit coverage only."
  - "No usage instrumentation exists for the sign (no Sentry or analytics event), so success is provable only by tests and the showcase page, not by measured use."
---

# Breakdown: hospitality-animations — Neon OPEN sign in the dashboard header

Tracking issue: **#4746**. Tree: `worktree-hospitality-animations` at `1d6189203` (`origin/main`, PR #4720 merged). Eight items, four milestones, one human step. Every child issue is self-contained — a worker branching from `main` never needs this directory.

## M1 — Hospitality seams (pure utilities, clock hook, header slot)

- [x] **deriveVenueOpenState — pure open-now derivation** — new `apps/hospitality/src/utils/venueOpenState.ts` + test: `VenueOpenState` union, `DeriveVenueOpenStateInput`, the 8-step zone-correct algorithm (Intl `formatToParts` in the venue zone, half-open `[open, close)`, overnight spill, inclusive 60-minute lead, malformed days skipped, unusable zone → `null`), reusing `hasOperatingHours` (tracker: #4738)
  - Accept: the architecture's 20 derivation cases green (unset fixtures; malformed-only → unset; mid-window; half-open edges; overnight spill both sides + overlap precedence; closed later today / skip closed / skip missing / wrap to same weekday; lead 59/60/61 + across midnight + `openingSoonMinutes: 30`; LA vs London at `2026-08-31T00:30:00Z`; `"Mars/Olympus"` / `""` / `undefined` / `null` → `null` without throwing; malformed times skipped; DST spring-forward and fall-back; input not mutated); imports `hasOperatingHours`, nothing from rialto; no lockfile diff.
  - Blocked by: —
- [x] **formatLocalTime + formatVenueOpenLabel — caption/accessible-name copy** — `formatLocalTime` in `utils/format.ts` (UTC-pinned 12-hour, reuses `LOCALE`), new `utils/venueOpenLabel.ts` with `WEEKDAY_LABEL`, tests in `format.test.ts` and `venueOpenLabel.test.ts` (tracker: #4739)
  - Accept: `17:00 → 5:00 PM`, `22:00 → 10:00 PM`, `02:00 → 2:00 AM`, `00:00 → 12:00 AM`, `12:30 → 12:30 PM`, identical under `TZ=Asia/Tokyo`; `Open until 10:00 PM`, `Open until 2:00 AM`, `Opens at 5:00 PM`, `Closed, opens at 5:00 PM`, `Closed, opens Tuesday at 5:00 PM`, `No operating hours set`; `venueOpenLabel.ts` contains no `Intl` / `new Date`; existing `formatTime` cases unchanged.
  - Blocked by: #4738
- [x] **useNow — 60 s clock hook** — new `apps/hospitality/src/hooks/useNow.ts` + test: `useNow(intervalMs = 60_000): Date`, `setInterval` in an effect keyed on `intervalMs`, cleanup on unmount, no visibility handling (tracker: #4740)
  - Accept: initial value equals mocked system time; same object at 59 999 ms; new `Date` at 60 000 ms; `useNow(1_000)` ticks at 1 s; interval change restarts (timer count stays 1); `vi.getTimerCount() === 0` after unmount; no `addEventListener`.
  - Blocked by: —
- [x] **PageHeader aside slot** — `aside?: ReactNode` on `components/PageHeader.tsx`; `.withAside` flex row + `.aside` + `@media (max-width: 767px) { .aside { flex-basis: 100% } }` in `PageHeader.module.css`; two new tests (tracker: #4741)
  - Accept: aside rendered inside `.aside` with root `withAside` when provided; neither present when omitted; five existing cases + rialto mock untouched; no colour literal, no `--rialto-accent*` / `--rialto-warning*`.
  - Blocked by: —

## M2 — Rialto `NeonSign` instrument

- [ ] **NeonSign instrument — component, CSS, unit + motion tests, barrel, build artifacts, changeset** — new `packages/rialto/src/components/NeonSign/{NeonSign.tsx, NeonSign.module.css, NeonSign.test.tsx, NeonSign.motion.test.tsx, index.ts}`; barrel line after `components/index.ts:97`; `.changeset/neon-sign-instrument.md` (minor); generated `package.json` exports + `registry.json` + rialto `llms*.txt` staged by path (tracker: #4742)
  - Accept: `role="img"` with the required `aria-label`; `data-state` ∈ four values; tube `[data-tube]` prints `OPEN` with `data-lit` true only for `open` / `opening-soon` and stays in the DOM in `unset`; housing + caption `aria-hidden`; `showCaption` default true; `sizeSm|Md|Lg`; `data-reduced-motion` + `reduced` under the global mock, inverse in the motion test; `className` / `ref` / rest forwarded; no `useEffect` / `useState`; CSS keyframes `rialto-neon-strike` (bound to `[data-state="open"]`) and `rialto-neon-breathe`, reduced-motion twin, no colour literal, gold only in `opening-soon`; `./NeonSign` in exports, `NeonSign` in `registry.json`, `exports:check` clean; visual suites untouched; no lockfile diff.
  - Blocked by: —
- [ ] **NeonSign — a11y matrix fixture + Storybook story** — `test/accessibility/component-fixtures.tsx` (import, `| "NeonSign"` union member, fixture) and `a11y-matrix.test.tsx` (`"NeonSign"` in `BARREL_COMPONENT_NAMES` after `"NavigationMenu"`); `NeonSign.stories.tsx` (`Data Display/NeonSign`; Default, AllStates, Sizes, WithoutCaption; no `play()`) (tracker: #4743)
  - Accept: matrix line `Accessibility — component matrix › NeonSign` green; coverage guard green with the entry (and red without it); stories export the four names with literal `aria-label`s; `STORIES` in `visual.spec.ts` untouched.
  - Blocked by: #4742

## M3 — rialto-web showcase

- [ ] **rialto-web NeonSignPage showcase + page-registry row + drift lists** — new `pages/data/NeonSignPage.tsx` (Service Day Replay / States / Playground with `key={replayNonce}` / Sizes / Props / Accessibility, `HandshakePage` shape); `{ id: "neon-sign", label: "Neon Sign", category: "Data Display" }` after `handshake` in `page-registry.ts`; mock line in `page-registry.test.ts`; `"NeonSign"` in `manifest-drift.test.ts` `DATA_COMPONENTS`; rialto-web `llms*.txt` (tracker: #4744)
  - Accept: `page-registry.test.ts › every load() resolves without throwing` and `manifest drift guard — data category › NeonSign` green after a rialto build; six sections with the exact titles; replay phase table `closed ×2, opening-soon ×2, open ×3` at 1 200 ms with cleanup; the `open` picker bumps `replayNonce`; six Accessibility `DataList` rows verbatim from ux.md; `PropsTable component="NeonSign"`; visual suites untouched; intro sentence flagged for UX override in the PR.
  - Blocked by: #4742

## M4 — Dashboard wiring

- [ ] **HomePage — NeonSign in the header aside, tests, CLAUDE.md, llms regen** — `useVenue` → `useNow` → `deriveVenueOpenState` → `formatVenueOpenLabel` → `<NeonSign>` in `PageHeader aside`; `HomePage.test.tsx` gains a `VenueContext` mock, `NeonSign` mock, `{aside}` in the `PageHeader` mock and seven cases; `apps/hospitality/CLAUDE.md` `HomePage` row; hospitality (+ root) `llms*.txt` (tracker: #4745)
  - Accept: 11 existing cases unchanged; `open` / `opening-soon` / `closed` / `unset` each render `img` with the right `data-state` and name; no venue → no `img`; `"Mars/Olympus"` → no `img`; the 60 s tick flips `opening-soon` → `open` with `Open until 10:00 PM`; `heading "Dashboard"` still unique, no new `status` / `meter`; `regen --check` clean; advisory E2E run id or "environment unavailable" recorded.
  - Blocked by: #4738, #4739, #4740, #4741, #4742

## Design gaps found

- **`page-registry.test.ts` needs a per-page `vi.mock` line.** The architecture's change surface for rialto-web lists `page-registry.ts` and `manifest-drift.test.ts` only, but `page-registry.test.ts:16-60` mocks every registry page individually and `every load() resolves without throwing` awaits each entry — a new row without its mock line fails that test. Resolved by file convention in #4744 (`vi.mock("../pages/data/NeonSignPage.js", () => ({ NeonSignPage: () => null }))` beside `:57`).
- **`.housing::before` lacks `content: ""` in the architecture's CSS block.** Without it the wash pseudo-element never renders and the `open` / `opening-soon` housing background rules are dead. #4742's spec includes it, marked as implied; no other property was added.
- **Showcase page intro sentence is unspecified.** ux.md gives "An instrument for a venue's trading state … (description)". #4744 asks Implement to write one sentence in the `HandshakePage` voice and flag it in the PR for UX override; acceptance does not depend on the wording.
- **Pre-existing, noted not fixed:** `Handshake` is absent from `manifest-drift.test.ts` `DATA_COMPONENTS` (`:190-212`). Out of scope for this run; #4744 explicitly leaves it alone.

## Coverage

| Architecture component                                                            | Item                  |
| --------------------------------------------------------------------------------- | --------------------- |
| `deriveVenueOpenState` (policy) + 20-case derivation test list                    | #4738                 |
| `formatVenueOpenLabel` + `formatLocalTime` (presentation)                         | #4739                 |
| `useNow` (clock)                                                                  | #4740                 |
| `PageHeader.aside` (slot)                                                         | #4741                 |
| `NeonSign` (instrument) + barrel + changeset + build artifacts                    | #4742                 |
| `NeonSign` story + a11y matrix                                                    | #4743                 |
| `NeonSignPage` (showcase) + registry + drift list                                 | #4744                 |
| `HomePage` (composition) + `CLAUDE.md` row                                        | #4745                 |
| Generated: rialto exports/registry/llms; rialto-web llms; hospitality + root llms | #4742 / #4744 / #4745 |

| PRD success criterion                                                                                                                                               | Item(s)                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Rialto: `role="img"` + required `aria-label`; `data-state` one of four                                                                                              | #4742                                  |
| Rialto: reduced motion — `data-reduced-motion`, no keyframe, static frames distinct                                                                                 | #4742                                  |
| Rialto: gold only in `opening-soon`; success token for `open`; neutral `closed` / `unset`; tokens only                                                              | #4742                                  |
| Rialto: compositor-only motion; no JS timers, no `setState` in `useEffect`                                                                                          | #4742                                  |
| Rialto: a11y matrix passes with a `NeonSign` fixture                                                                                                                | #4743                                  |
| Rialto: story shows all four states                                                                                                                                 | #4743                                  |
| Rialto: `.changeset/*.md` marks rialto `minor`                                                                                                                      | #4742                                  |
| Showcase: page reachable via `page-registry.ts` (Data Display), four states                                                                                         | #4744                                  |
| Showcase: not added to either visual suite                                                                                                                          | #4742, #4743, #4744 (each asserts)     |
| Derivation: venue zone not browser; overnight; closed/missing days; DST; half-open; lead 59/61; `unset` matching `hasOperatingHours`; malformed + unrecognised zone | #4738                                  |
| Dashboard: `HomePage` renders the sign per state from `useVenue().selectedVenue`; no venue → no sign                                                                | #4745                                  |
| Dashboard: label changes over time without a reload (≥ once a minute)                                                                                               | #4740, #4745                           |
| Dashboard: existing `HomePage.test.tsx` cases pass; `dashboard.spec.ts` selectors stay unique                                                                       | #4745                                  |
| Repo: `pnpm regen --check` clean; changeset; `apps/hospitality/CLAUDE.md` row                                                                                       | every item (regen); #4742; #4745       |
| Repo: PR to `main`, `CI Gate` green, no unfixed critical review finding                                                                                             | Implement / Review stages, not an item |

## Notes

- **Dispatch.** Serial on `worktree-hospitality-animations`, one PR, order 1 → 8. Fallback for `/implement-queue`: ready now #4738, #4740, #4741, #4742 (disjoint files); flip #4739 when #4738 merges; flip #4743 and #4744 when #4742 merges; flip #4745 when #4738–#4742 have all merged.
- **Shared-file audit.** No two unblocked items touch the same file: `components/index.ts` (#4742 only), `component-fixtures.tsx` / `a11y-matrix.test.tsx` (#4743), `page-registry*.ts` / `manifest-drift.test.ts` (#4744), `HomePage.*` / `apps/hospitality/CLAUDE.md` (#4745), `format.ts` (#4739), `PageHeader.*` (#4741).
- **Regen.** `pnpm build --filter @mbe/cli... && pnpm regen && pnpm regen --check` in every item; generated files staged by explicit path, never `git add -A`. Consumers typecheck against `packages/rialto/dist`, so rebuild rialto before the #4744 / #4745 gates.
- **Untouched by every item** (asserted with `git diff --stat origin/main -- …` in each issue): `WatchLoader/**`, `venue-onboarding/**`, `floor-plan/**`, `LoginGate` / `CallbackPage` / `SessionExpiredGate` / `App.tsx`, `apps/rialto-web/src/pages/auth/**`, `apps/hospitality/e2e/**`, both visual suites, `packages/types`, `services/**`, `infrastructure/**`, `.changeset/config.json`.
- **Tracker mirror.** Issues #4738–#4746 are the one-way export of this file (ADR-0026); this file is the source of truth. `gh issue edit --body-file` worked for all eight children (the `gh pr edit` breakage on this repo does not extend to issues).
