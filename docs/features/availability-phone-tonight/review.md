---
stage: review
run: feature:availability-phone-tonight
date: 2026-11-08
assumptions:
  - "An independent `reviewer` subagent read `git diff 6f15dbcb5..HEAD -- apps/hospitality` at 801c8f083 against prd.md, ux.md and architecture.md. Severities are the reviewer's. The major and every minor were fixed in 9ad5f14a7 and the e2e follow-up; none were deferred."
  - "Written before verification.md, so verification reflects the fixed tree."
---

# Review: Availability on a phone, and what's on tonight

## Scope

Diff `6f15dbcb5..HEAD -- apps/hospitality` (43 files):
- the phone service lines and the phone Guest preview row in the shared week form;
- the refused-Save focus;
- the Today line (model, text, hook, view, header slot);
- `useStaffTonight`'s additive fields;
- the Timeline `?tonight=open` deep link;
- the new e2e spec and deliberate spec updates.

## Findings

### Major: a forced-open line collapsed the moment its problem was fixed from inside it

- **Scenario:** on a phone, open Lunch, clear its name, open Dinner, then press Save. The refused Save focuses Lunch's name. Typing one letter clears the problem, Lunch's fields unmount, the keyboard drops and focus falls to the page body.
- **Standard:** none.
- **Decision:** fixed in `9ad5f14a7`. Focusing a field adopts its line as the open one, and pressing a problem header pins the line instead of doing nothing. Tests cover the in-line fix path (same element, still focused) and a pinned line staying open after the fix. An e2e test types inside a new line at 375 px.

### Minor: fixed

- **m1:** the Timeline's open request fired again on every remount of the Tonight control (venue switch, retry). It is now spent once.
- **m2:** an old-API summary without `services` gave a dangling " · " and misread bounded windows. It now shows no hours segment and only night-of items.
- **m3:** between the config and days refetches, a new night-of band could flash as a closure. Bands whose rule isn't in the config are skipped.
- **m4:** a from-time band for a service not running that day read "Dinner closing early". It now shows nothing; a whole-day band still names the service.
- **m5:** `<p>` inside the header buttons. Fixed with `Text as="span"`.
- **m6:** rotating across 767 px remounted every row and dropped the open line. The keyed wrapper is now the same in both modes, and focus seeds the open line.
- **m7:** "other hours Every day" came out with a capital mid-clause. It now uses the lowercase phrase.
- **m8:** tests that only checked wiring were replaced with behaviour tests:
  - the Today line's said-once rule runs through the real hook;
  - the refused-Save e2e names the focused field;
  - T2 checks Back and reload.

### Found by e2e, fixed

- Line headers carried an `aria-label` that didn't contain their visible text, failing axe label-in-name in Change regular week at 375 px. The visible text is now the name, with hidden separators.
  - Chrome computes "Lunch , 11:30 AM–3:00 PM · Every day", with a space before the comma, because the column's children are blocks.
  - Moving the separator inside the name span fixes Chrome but breaks jsdom's name computation, which trims each element.
  - Kept as is: a screen reader reads both forms the same way.
- The first Today line block cost 50 px on desktop and 78 px on a phone and failed three calendar first-screen guards. It moved into the header's description slot (ux.md amended).
- On a phone the Guest preview stacked 915 px under the form, keeping P2 at 1,553 px. It is now one row (ux.md and prd.md amended).

### Minor: deferred

- Lint warnings rose from 239 to 240: one `react-hooks/set-state-in-effect` warning in `TimelineTonight` (m1's spend-once). The ref alternative is an error under `react-hooks/refs`; the rule already warns elsewhere in the repo.
- `AvailabilityPage.tsx` is 866 lines (862 before this run, +4). It was over the limit before; seeded in `docs/backlog.md`.

## Passes with no findings

Each pass was checked against the code and the engine, per the reviewer:
- Service day vs calendar day.
- Band classification vs `resolve-day.ts`.
- Night-of bands skipped.
- The said-once rule matching the banner's own condition.
- Expired rules.
- Loading and error states.
- Dedupe.
- The refused Save never submits.
- Focus on add and remove.
- Closed rows hold no state.
- Onboarding unaffected.
- `useStaffTonight` consumers.
- The `PageHeader` `ReactNode` change.
- The deep link's replace and Back.
- i18n parity and natural phrasing.
- Repo rules.

## Verdict

Ready for Ship once verification.md is green: no critical findings, the one major and all minors fixed, two minors deferred with reasons.
