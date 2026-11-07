---
stage: operate
run: feature:remembered-on-arrival
date: 2026-11-07
users-observed: 0
signal-source: "No human use is recorded anywhere, so the count is 0. Sources read 2026-11-07: `gh pr view 6355 --json state,mergedAt,mergeCommit` (merged 2026-10-12T00:59:29Z as f3725682c); `git -C $W log origin/main f3725682c..origin/main -- <the Special Requests source files>` and `--grep` for revert/remembered/special request (no revert; one follow-up fix, #7016); `git grep` on origin/main c4320513d for the acknowledgement literal; `gh issue list --state all --search` for `remembered-on-arrival`, `SpecialRequestsTicket`, `confirmation-copy`; Sentry MCP `search_issues` (`is:unresolved environment:production`, 30d, org mattbutlerengineering): 15 issues, none titled for these surfaces, and its user counts are not people who saw this feature. The booking pages carry no analytics, and the Cloudflare analytics token named in autorun-brief.md § Operate is still pending. verification.md and release.md already record zero reachable rendered guest cards on production and no live venue slug in the repo."
assumptions:
  - "Population is 0, not 1. Matt (`mattbutlerengineering`) is the only person who could have used it. No record shows him entering Special Requests on a booking or opening a host ticket with one, and his merge of #6355 is shipping, not using. The CI and local E2E runs on a synthetic session are the sample, not people."
  - "Sentry's user counts (e.g. HOSPITALITY-D 45 users, HOSPITALITY-C 31 users on a `mbe-round-trip-…-hospitality sentry heartbeat` error) are heartbeat and API-error reports. They do not show anyone reaching the confirmation, manage or ticket surfaces, so they are excluded from the population. HOSPITALITY-D/-E/-F are titled only `reportApiError`; I did not open them to attribute them to a surface."
  - "Autorun-brief § Operate asked for a retro only once feedback exists. 25 days after merge there is none, so this retro records state and carries what to measure. The brief's own prediction (public pages as the one observable surface, Sentry error-only, Cloudflare analytics pending) held."
  - "The review's 4 minors and the Pending Owner decision are 'open debt' at their release.md state. I re-read their current state on origin/main and report it below rather than the state at release."
  - "The 16 tracker issues (#5860-#5875) were created 2026-09-28, before the merge, and are all closed. They are the run's own mirror and count toward nothing."
---

# Retro: Remembered on arrival (#6355)

## Outcomes vs. intent

With 0 people observed, nothing here landed or was used. Each outcome records the state of the thing.

### idea.md: "A guest who typed an occasion, a seating preference, or an allergy sees it acknowledged before they arrive, and the host's ticket says the same thing."

- What happened: the code that does this is merged (#6355, `f3725682c`, 2026-10-12) and deployed (Deploy Static Sites run 38190128781, `Deploy Hospitality` and `Post-Deploy Verification` success). No revert: `git log origin/main --grep=revert f3725682c..` names this run only in the docs commit #6957. The five surfaces are still on origin/main (`ConfirmationView.tsx`, `ManageReservationPage.tsx`, `SpecialRequestsTicket.tsx`, `BriefingPage.tsx`, `ReservationSheet.tsx` each read `bookingWidget.specialRequests.*`). Production served it as of 2026-10-17 (`index-Bd9I8AYX.js` carries the sentence, per release.md). I did not re-fetch the production bundle today. Whether any guest typed a request and saw it said back is unknown.
- Signal strength: unobserved

### SC1 / SC2 / SC3: guest and host surfaces say the request back (PRD)

- What happened: verification 2026-10-16 found all three PASS on tests and local E2E at 375 px and tablet sizes. Since then #6976, #7617, #7745 and #8240 edited `ManageReservationPage.tsx` and #7872 added the eat-sheet.com host, and the Special Requests block was not reverted by any of them. The rendered guest cards and every host surface were never reached on production (they need a real booking, a manage token, or Auth0). State: present and test-covered, never seen by a person.
- Signal strength: unobserved

### SC4: one copy source

- What happened: this was the run's only FAIL and it is now fixed, by a different run. #6735 duplicated the sentence into `en-US.json` and the guard only scanned `.ts`/`.tsx`. #7016 (`babc45120`, 2026-10-17, run `docs/fixes/confirmation-copy-catalog-source`) took review option (b): `constants/confirmation-copy.ts` is deleted, `en-US.json` is the only non-test file holding "Noted. It's on your reservation for the team." (`git grep` on origin/main prints only `en-US.json:1385`), the host caption nests the acknowledgement by key, and the guard moved to `i18n/special-requests-copy.source.test.ts` and scans `.json`. The "Pending Owner decision" in release.md is therefore resolved.
- Signal strength: measured (grep on origin/main today)

### SC5-SC9: empty renders nothing, untrusted text stays text, honest contact line, honesty limits, legibility

- What happened: all passed at verification. The honest contact line ("No confirmation email or text is sent for this booking…") is in `en-US.json` and the old false line is absent from source. SC8's banned-word list in `special-requests-copy.test.ts:106-130` still checks the en-US strings only. es-MX and fr-CA are covered by the caption-nesting test but not by a word list. No person has read the honest line.
- Signal strength: unobserved

### SC10-SC12: no excluded change, production evidence, gates

- What happened: SC10 and SC12 passed (44 files, all under `apps/hospitality/`, `docs/`, llms pairs; CI Gate green on the merge SHA). SC11 passed with a stated gap: bundle contents and the 0-error `/reservations/manage` page shell, no rendered card.
- Signal strength: measured (CI and deploy records), for the gates only. Use: unobserved

## Did the defect-class recur? (feature run, regression question)

Not a maintenance run, but the SC4 decay is a recurrence of a pattern: a later feature (#6735) broke a prior run's "written once" contract and nothing red told it. That happened because the guard decayed silently, see Environment.

## Open debt

The run's own debt: the review's 4 minors and the SC4 decision were deferred to prose in `release.md` § Follow-ups, with "None were filed". No issue cites this run's `review.md` or `verification.md` (`gh issue list --state all --search "remembered-on-arrival"` returns only the 16 tracker issues, all closed). Current state of each, read on origin/main:

- Minor 1, SC4 guard and contract decay: **resolved** by #7016. `architecture.md`'s frontmatter copy-source decision still names `CONFIRMATION_COPY`. I did not check whether #7016 amended it; the run directory is a record, not live.
- Minor 2, host ticket untranslated, caption quotes en-US: **resolved** by #7016 (`SpecialRequestsTicket` reads label and caption through `t()`, caption nests the guest's sentence). The sub-recommendation, making `no-literal-ui-strings` see strings imported from `constants/*`, is **not done**: `packages/config/eslint/local-rules.js` has no change for that, and the only related commit is #7108 (JSX conditionals).
- Minor 3, SC8 honesty limits for es-MX/fr-CA: **open**. `special-requests-copy.test.ts` still has one banned-word list, applied to en-US.
- Minor 4, manage-page error copy cites a confirmation email: **open**. `en-US.json:1458` (`supportLine`) and `:1461` (`noLinkDescription`) still say "confirmation email". Already seeded at `docs/backlog.md:266`.
- Follow-up 6, `briefing.spec.ts:101` timezone-dependent: **open as far as I can tell**. `apps/hospitality/playwright.config.ts` has no `timezoneId`, and the spec's last change is #8034 (2026-11-01). Not re-run.
- Tracker issues #5860-#5875: closed. Tracking issue #5875 closed 2026-10-12T00:59:32Z by the merge.

## Run retrospective

- Keep: the **PRD stop-and-surface** before writing. The idea's first draft claimed the widget captured `occasion` and `seatingPreference`; the PRD stage checked the form, found one free-text field, and the user re-decided on "say the guest's own words back" (idea.md § Solution hunch). That saved a feature built on a wrong premise.
- Keep: **architecture's mirrored-formula and drift tests** (`sheet-size.test.ts` guards the rialto Drawer sizes; M4.2 proved it live by editing `compact` to 241 px and watching it fail). Several guards in this run were proven live with a scratch edit (M1.2, M4.2, M4.4), and that is what made the E2E clearance trustworthy.
- Keep: **Verify caught a literal-criterion gap that a green test hid** (breakdown M4.4: `scrollWidth <= innerWidth` stayed green with `overflow-wrap` removed, because an ancestor clips). The spec added a second assertion on line-box right edges.
- Change: **the run merged (PR #6355, 2026-10-12) before Verify, Review and Ship existed**; they were backfilled on 2026-10-16 (release.md "The release had shipped before either artifact existed"). All four review minors were then deferred, none filed. The review's own seed, "file one issue or backlog line per deferred finding", is already in the backlog twice (from other runs); this run is a third instance. Release.md proposed 5 seeds "for Operate to append"; that held until now only because Operate was last.
- Change: the success criterion SC4 was a **grep over today's tree** ("exactly one non-test file"), which a later PR in another run can falsify without touching this run's files. Write cross-run invariants as a test the later PR must pass, not as a one-time check.
- Change: **SC11 could not reach the rendered feature.** The PRD knew this up front and bounded it honestly, but the feature's intended signal (a guest sees their words) can only be seen after a real booking. 25 days later there are still none. Plan the observation path before shipping a guest feature: a stable demo venue slug (seeded in the localization retro) would have made SC11 provable.
- Stop: nothing. The 16-item tracker mirror (#5860-#5875) was labelled `blocked` and closed as one PR merged; it added bookkeeping for a single-PR run but cost little.

## Environment

Mistakes recorded in verification.md § Failures, review.md § Findings and breakdown.md Notes. Each row names what in the repo would catch it. The hooks are `.husky/pre-commit` (lint-staged) and `.husky/pre-push` (main guard, destructive migrations, antipattern ratchet, regen). Neither runs typecheck or vitest. `pnpm typecheck` and `pnpm test` run under CI jobs `Typecheck` and `Test (Node 22)` (release.md Release log 2).

| Mistake | Evidence | Class | Proposed carrier |
|---|---|---|---|
| A later PR (#6735) duplicated the acknowledgement into `en-US.json`; the SC4 guard scanned only `.ts`/`.tsx`, so it stayed green | `verification.md` § SC4, Failures; `review.md` § Minor 1 | mechanical | **Already fixed** by #7016: `apps/hospitality/src/i18n/special-requests-copy.source.test.ts` now scans `.json`, run by CI `Test (Node 22)`. Residual: nothing re-checks that a guard's file-type filter still covers where the copy lives |
| Host ticket label and caption are English in a Spanish dashboard; `no-literal-ui-strings` cannot see strings imported from `constants/*` | `review.md` § Minor 2 | mechanical | `no-literal-ui-strings` in `packages/config/eslint/local-rules.js`, run by CI `Lint`. Not yet extended; same blind spot may hide `constants/session-lapse-copy.ts` |
| SC8 banned-word honesty list covers en-US only | `verification.md` § SC8 scope note; `review.md` § Minor 3 | mechanical | `apps/hospitality/src/i18n/special-requests-copy.test.ts` (CI `Test (Node 22)`): a per-locale word list for es-MX and fr-CA |
| `briefing.spec.ts:101` fails whenever the machine timezone is not America/New_York | `verification.md` § Regression sweep | mechanical | `apps/hospitality/playwright.config.ts` (`use.timezoneId`), run by `.github/workflows/e2e.yml`. No `timezoneId` is set today |
| Manage-page error copy cites a confirmation email that the widget never sends | `review.md` § Minor 4 | judgement | Product decision, owned by Matt; already `docs/backlog.md:266`. No check can tell whether a product claim is true |
| After a rebase, `pnpm typecheck` exited 2 on three feature test lines (possibly-undefined index reads) | `breakdown.md` Notes, 2026-10-11 M5.2 | mechanical | CI `Typecheck` caught it; it was found locally only because Implement ran the gate. Neither `.husky/pre-commit` nor `.husky/pre-push` runs typecheck, so a push without it reaches CI first. **Finding: the local typecheck is opt-in (`pnpm pre-commit:full`)** |
| SC6's literal grep printed one hit: a doc comment naming the API it forbids | `breakdown.md` Notes, M5.2 | judgement | The criterion's wording (`grep dangerouslySetInnerHTML`), not a check: scope the grep to non-comment code or an ESLint `react/no-danger` rule. Not verified whether the repo enables it |
| The `scrollWidth <= innerWidth` check for SC9 stayed green with the failure present | `breakdown.md` Notes, M4.4 deviation | judgement | The PRD wording. The fix lives in `apps/hospitality/e2e/special-requests.spec.ts` (line-box edge assertion), a test, not a rule |
| `gh run list --branch main` filtered by `headSha` returned no runs for the merge SHA, so Verify could not find the CI run | `release.md` § Release log 2; `verification.md` § Not verified | judgement | A line in `AGENTS.md` or a gotchas entry: use `gh api "repos/<repo>/actions/runs?head_sha=<sha>"`. No checker can hold this. I did not verify a gotchas file exists |
| Verify, Review and Ship were backfilled after merge; the SC4 failure shipped as a "drift after merge" with no owner until a separate maintenance run | `release.md` header, `review.md` § Decision lines | judgement | The pipeline protocol, not the repo: `ship-pr` / `idea-to-prod` gating. Existing backlog seeds cover making deferrals trackable |

## Idea seeds

- Measure whether anyone has seen the feature: query Cloudflare analytics (once the token exists) or the hospitality `reservations` table for bookings with non-empty `notes` created since 2026-10-12, grouped by venue and by whether the booker was Matt; 0 is a valid answer (from: feature:remembered-on-arrival)
- Add per-locale honesty word lists (overclaim and false-send) for the es-MX and fr-CA acknowledgement, caption and contact line in `special-requests-copy.test.ts`, with one failing fixture per locale (from: feature:remembered-on-arrival)
- Make `no-literal-ui-strings` (or a test) catch user-visible strings imported from `apps/hospitality/src/constants/*`; measure by counting exported string literals in `constants/*.ts` that reach JSX (from: feature:remembered-on-arrival)
- Pin `timezoneId` in `apps/hospitality/playwright.config.ts` and re-run `briefing.spec.ts:101` under a non-Eastern machine timezone to prove it (from: feature:remembered-on-arrival)
- Write cross-run "written once" criteria as a test with a guard-coverage check (the guard's file filter must include every extension the copy lives in) instead of a one-time grep (from: feature:remembered-on-arrival)
- Count Sentry `reportApiError` issues HOSPITALITY-D/-E/-F by route, so a future retro can tell guest booking and manage-page errors from heartbeat noise (from: feature:remembered-on-arrival)

Not seeded, already in `docs/backlog.md`: the manage-page "confirmation email" copy (line 266), a stable public demo venue slug (from the localization run), and filing deferred Review minors at Review.

## Run complete

Closed 2026-11-07, 25 days after merge, with 0 people observed. The feature is merged, deployed and unreverted, and its one contract failure (SC4) was fixed on 2026-10-17 by #7016. Whether any guest was ever told "Noted. It's on your reservation for the team." is unknown. Seeds above are the input to the next Idea-stage run.
