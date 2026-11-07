---
stage: operate
run: maintenance:confirmation-copy-catalog-source
date: 2026-11-07
users-observed: 0
signal-source: "none identifiable for the surface's users. Read 2026-11-07: `gh pr view 7016 --json state,mergedAt,mergeCommit`; `gh api repos/.../actions/workflows/deploy-static.yml/runs?head_sha=babc4512003f1ca32bba0237ec8a595bdf16430a` and `.../commits/<sha>/check-runs` (job conclusions); `git -C $W log origin/main -- <touched paths>` and `git grep origin/main` for the sentence, `hostCaption`, `CONFIRMATION_COPY`; `curl` of https://mattbutlerengineering.com/hospitality/ and its es-MX / fr-CA lazy chunks; Sentry MCP `search_errors` for `SpecialRequestsTicket` / `hostCaption` (default 14d window, 0 results; the hospitality project carries no locale tag, so es-MX/fr-CA staff cannot be separated, per the 2026-11-03 localization-conditional-literals retro); `gh issue list` / `gh pr list` searches on the ticket and the copy since 2026-10-17 (none). No Cloudflare analytics token."
assumptions:
  - "`release.md` predates the `outcome:` field and its own Outcome reads 'Prepared, not yet released', so the soft gate was checked against `gh`: PR #7016 is MERGED (2026-10-17T16:09:46Z, squash `babc45120`). Treated as Ship-complete."
  - "`autorun-brief.md` has no `operate:` section, so there is no minimum signal to report against. The brief's own release criterion (Deploy Static Sites job-level conclusion) is reported below."
  - "Staff on es-MX or fr-CA are the only people for whom this fix is visible, and hospitality has no real users per the 2026-11-03 retro. Zero is therefore not a measured zero: no tool here can see a locale. The count rests on the absence of any issue, PR, comment or Sentry event, which is weak evidence of no use."
  - "Defect recurrence is judged from main's code (one source of the sentence, no constant, ticket reads the catalog), not from a rendered es-MX ticket. The E2E that renders one is not re-run in Operate."
---

# Retro: one source for the Special Requests copy, host ticket in the staff locale

## What shipped and where it stands

`release.md` records the release as pending. It was never updated afterwards, so `gh` is the record: PR #7016, squash `babc45120`, merged 2026-10-17T16:09:46Z, 21 days ago. The merge triggered Deploy Static Sites run `39048201740` (`push`, `success`). Job level, read from the commit's check-runs: `Deploy Hospitality` success, `Post-Deploy Verification` success, `Post-Deploy Smoke Test` success, `Deploy Blocked` skipped, `Rollback Failed Deploys` skipped. The circuit breaker did not swallow it.

## Defect recurrence

**Did not recur.** Checked on `origin/main` at `c4320513d`, 21 days after release:

- `git grep "on your reservation for the team" -- apps/hospitality/src ':!*.test.*'` finds one non-test file, `i18n/catalogs/en-US.json` (1 hit). SC4's one-source guarantee holds.
- `git grep CONFIRMATION_COPY -- apps/hospitality` finds nothing. `constants/confirmation-copy.ts` is absent from `apps/hospitality/src/constants/`.
- `SpecialRequestsTicket.tsx:33` still reads `t("bookingWidget.specialRequests.hostCaption")`. The ticket, `special-requests-copy.test.ts` and `special-requests-copy.source.test.ts` have no commit on main after `babc45120`. No fix, revert or follow-up touched them.
- No issue or PR since 2026-10-17 matches the ticket, `hostCaption` or the copy. Sentry shows 0 events for either term in 14 days.

So there is nothing to ask the pipeline about a missed regression test, review finding or design constraint for the original defect. The one place the same class of defect did recur is adjacent, not this run's: English outside the lint rule's reach keeps turning up (#8036, #8089, #8105, per the 2026-11-03 retro). That is the `constants/*` blind spot below.

## Outcomes vs. intent

The population is 0 (frontmatter), so every outcome is `unobserved`. Each records state. Targets are from `defect.md` § Defect (Expected) and § Work items.

### The acknowledgement sentence is a literal in exactly one non-test file, the en-US catalog

- What happened: true on main (1 non-test hit, above). The deployed bundle agrees: the sentence appears once in `index-DF9_C-tG.js` (en-US), once in `es-MX-YN7ua3QU.js` and once in `fr-CA-DCyhyBl8.js`, fetched 2026-11-07. Per locale that is one copy, as release.md's post-release check asked for. `CONFIRMATION_COPY` appears in none of the 17 chunks fetched.
- Signal strength: unobserved

### A retyped copy in any `.json` under `src/` fails the guard

- What happened: the guard (`i18n/special-requests-copy.source.test.ts`) is on main and scans `.ts`, `.tsx` and `.json`. Verify proved it fails on a throwaway retype (`zz-probe.json`, `zz-ZZ.json`) and reverted both. No real retype has been attempted in 21 days, so whether it fires on a real change is unobserved.
- Signal strength: unobserved

### The host ticket's label and caption come from the catalog in the staff's locale, and the caption quotes the guest's sentence by reference

- What happened: the es-MX and fr-CA chunks served in production carry the new captions with the nested key unresolved, as designed: `Los invitados ven esto con: “$t(bookingWidget.specialRequests.acknowledgement)”` and `Les clients voient ceci avec : « $t(bookingWidget.specialRequests.acknowledgement) »`. No one has been observed reading the ticket in either locale. The strings are machine-translated and have had no native-speaker review (review.md assumption, `locales.ts` `machineTranslated: true`).
- Signal strength: unobserved

### The en-US caption is byte-identical to the retired constant

- What happened: the en-US chunk holds `Guests see this with: “$t(bookingWidget.specialRequests.acknowledgement)”`. Byte-identity after nesting is pinned by `special-requests-copy.test.ts` (`hostCaption` toBe the old string). en-US and en-GB staff see no change by design.
- Signal strength: unobserved

### Gates

- What happened: Verify `10 PASS, 0 FAIL`; Review ready to ship with three test-only fixes in place; deploy job `success` (above). `Apps Visual Regression` was red on the PR and on main pushes before it, by Review's evidence, and is outside `ci-gate`'s needs. Not re-measured in Operate.
- Signal strength: unobserved (a fact about CI, not about people)

## Open debt

No issue was filed for this run: its brief said "no issue seeds this run, and none is created". `gh issue list --search` on the ticket and copy since 2026-10-17 returned nothing. Both deferrals below live only as prose in `release.md` § Follow-ups, `review.md` and `defect.md` Notes. Their state is read from `origin/main`, not from an issue.

- Review deferral (human-merged docs): `docs/features/remembered-on-arrival/architecture.md` still names `constants/confirmation-copy.ts` as the live copy source at lines 6, 37, 52, 84, 154, and `confirmation-copy.test.ts` at 228, 232, 329, 325 (`git grep confirmation-copy origin/main -- docs` shows the file; `breakdown.md` of the same feature also does, as history). **Still open, 21 days.** It sat because `**/architecture.md` is an implement-queue gate path and nobody took the human-merged PR.
- Review deferral (carried from remembered-on-arrival review finding 3): no honesty word list for the es-MX and fr-CA Special Requests copy. `special-requests-copy.test.ts` still runs its banned-word check on the en-US caption (`:121`). **Still open.**
- `release.md` § Follow-ups proposed a third line (lint rule following `constants/*` imports). It was never written to `docs/backlog.md`, and `constants/session-lapse-copy.ts` is still on main and imported by `DashboardLayout.tsx` and `SessionExpiredGate.tsx`. **Still open, no owner.** Carried as a seed.

## Run retrospective

- Keep: RED first on both halves. The guard failed listing both files before any source change, and the ticket test failed on the missing localized group name, so the fix is reproducible from the tests alone.
- Keep: Review turned Verify's throwaway real-browser evidence into committed E2E cases (`special-requests.spec.ts`, es-MX and fr-CA) and generalized the nesting test to every catalog, so a locale added later cannot retype the caption. That is the kind of finding a reader of the diff would not make. It was the reason the defect class is closed for new catalogs.
- Keep: nesting by key (`$t(...)`) rather than copying the sentence into the caption. Production now shows the caption holding the key, not the words, in all three shipped locales.
- Change: the brief's gate list said `locale-sweep.spec.ts` covers "the ticket". Verify found it never opens one. Gates named in a brief should be checked at brief time for whether they can reach the changed surface (the same lesson as the 2026-11-03 retro's size-limit and CI-only signal).
- Change: `release.md` was left reading "Prepared, not yet released" after the merge. Its post-release checks (deploy job, prod strings, Sentry) had no recorded result until this retro ran them. The release record should be amended with the merge SHA and the deploy job conclusions when the orchestrator merges.
- Change: a deferral routed to a human-merged docs PR needs a tracker entry at Review. Three weeks later the doc still contradicts the code and no issue carries it.
- Stop: nothing worth stopping. The run was proportionate: one component, three catalogs, tests.

## Environment

One row per mistake the run recorded. Sources: `defect.md` Reproduction and Notes, `review.md` findings, `verification.md` § Failures. `verification.md` § Failures lists none beyond the intentional RED runs.

| Mistake                                                                                                                                                                 | Evidence                                                                                | Class      | Proposed carrier                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The SC4 guard scanned only `.ts`/`.tsx`, so the catalog copy of the sentence made a second source invisibly.                                                            | `defect.md` § Reproduction ("Why the guard misses the second")                          | mechanical | `apps/hospitality/src/i18n/special-requests-copy.source.test.ts`, now scanning `.json`. It runs in the `Test (hospitality)` job and lint-staged. Closed.                                                                                                    |
| `no-literal-ui-strings` cannot see UI strings imported from `constants/*`, which is how the English host ticket passed lint.                                            | `defect.md` § Reproduction ("Why no test caught the ticket"); `release.md` § Follow-ups | mechanical | `mbe-local/no-literal-ui-strings` in `packages/config/eslint/local-rules.js`, extended to follow `constants/*` imports. No one carries the work: not in `docs/backlog.md`, not an issue. `constants/session-lapse-copy.ts` is the live example.             |
| The ticket was never mounted under a non-en-US locale in any test (`notes: null` in `timeline-localization.test.tsx`), so English in it was invisible.                  | `defect.md` § Reproduction; `review.md` third minor                                     | mechanical | `apps/hospitality/e2e/special-requests.spec.ts` es-MX and fr-CA cases added by Review. Closed for the desktop sidebar. The tablet sheet and phone drawer in es-MX/fr-CA remain jsdom-only (`verification.md` re-check).                                     |
| The nesting test listed locales by hand, so a later catalog could retype the caption unseen.                                                                            | `review.md` first minor                                                                 | mechanical | `special-requests-copy.test.ts`, now reading every catalog in `src/i18n/catalogs/`. Closed.                                                                                                                                                                 |
| The en-GB case asserted absence of `hostCaption` while its title promised fallback: a false red and a missed broken fallback.                                           | `review.md` second minor                                                                | judgement  | `special-requests-copy.test.ts` en-GB case, now resolving through i18next. Closed.                                                                                                                                                                          |
| The brief named `locale-sweep.spec.ts` as the gate for the ticket, but the sweep never opens a ticket and stores the guest locale key, not the staff one.               | `review.md` § Scope assumptions; `verification.md`                                      | judgement  | None deterministic. The 2026-11-03 retro's seed on per-shape fixtures is the nearest. Recorded here as a finding.                                                                                                                                           |
| `docs/features/remembered-on-arrival/architecture.md` still names the deleted constant as the copy source, since the fix could not edit a gate-path file in its own PR. | `review.md` fourth minor (deferred); `defect.md` Notes                                  | judgement  | No existing check reads a deleted path out of docs. `pnpm regen --check` covers generated artifacts only. Finding: the gate path rule that protects the PR also leaves doc/code drift with no owner.                                                        |
| No honesty word list for the es-MX and fr-CA Special Requests copy, so a machine retranslation could add an overclaim unseen.                                           | `review.md` fifth minor (deferred); `release.md` § Follow-ups                           | mechanical | `special-requests-copy.test.ts` (the existing SC8 `describe`), extended to the es-MX and fr-CA resolved captions. It runs in `Test (hospitality)`.                                                                                                          |
| `Apps Visual Regression` was red on main before the PR, and a red on the PR was weighed by hand.                                                                        | `review.md` § Domain checks; `release.md` § Pre-flight advisory                         | judgement  | `.github/workflows/apps-visual.yml` is not in `ci-gate`'s needs, so a red there never blocks a merge. Finding: the pipeline merged past it with only prose evidence. The 2026-11-03 retros' fold-guard seeds cover the same decision for `Hospitality E2E`. |

## Idea seeds

- Make `no-literal-ui-strings` follow imports from `constants/*` (or ban copy literals there), starting by measuring how many English UI strings `constants/session-lapse-copy.ts` and its siblings hold and whether the locale sweep ever renders them (from: maintenance:confirmation-copy-catalog-source)
- Extend the SC8 honesty word list in `special-requests-copy.test.ts` to the resolved es-MX and fr-CA captions and contact line (for example "garantizado", "confirmé"), and measure by retranslating one caption with an overclaim and watching the test fail (from: maintenance:confirmation-copy-catalog-source)
- Update `docs/features/remembered-on-arrival/architecture.md` lines 6, 37, 52, 84, 154, 228, 232, 325, 329 to name `bookingWidget.specialRequests.acknowledgement` (nested by `hostCaption`) instead of the deleted constant, as a human-merged docs PR; verify with `git grep confirmation-copy -- docs` returning only history files (from: maintenance:confirmation-copy-catalog-source)
- Have Ship amend `release.md` with the merge SHA, the Deploy Hospitality and Post-Deploy Verification job conclusions and the prod-string check once the merge lands, so Operate starts from a record instead of re-running the post-release checks; measure by counting maintenance runs whose `release.md` still says "not yet released" after merge (from: maintenance:confirmation-copy-catalog-source)
- Add es-MX and fr-CA ticket cases for the tablet sheet and the phone drawer (`ReservationSheet`) to a committed E2E spec, since only the desktop sidebar has browser evidence; measure the cases added (from: maintenance:confirmation-copy-catalog-source)

## Run complete

Closed 2026-11-07. Seeds above are the input to the next Idea-stage run. The existing `docs/backlog.md` seed "Locale instrumentation" is the carrier for ever counting an es-MX or fr-CA staff user of this surface and is not duplicated here; the TapeChart, non-JSX hospitality literal and lint-sink seeds from `localization-conditional-literals` and `feature:localization` are not repeated.
