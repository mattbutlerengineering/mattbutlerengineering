---
stage: review
run: maintenance:confirmation-copy-catalog-source
date: 2026-10-17
assumptions:
  - "Run scale: a maintenance fix on one component, four catalogs and its tests. Ran all five passes, but at maintenance depth. Verify's regression evidence is the floor and is not re-run, except where a Review fix touched it (re-check note in verification.md)."
  - "Fix-in-place scope: the change is not merged, so Review fixed its three minor findings in place. All three are test-only (one unit test file, one E2E spec). No source, catalog, or generated file changed. The skill's default is to route anything non-trivial to Implement; these were judged trivial."
  - "The committed E2E case: the brief's gate list says 'plus locale-sweep.spec.ts for the ticket', and Verify showed that locale-sweep never opens a ticket. Review put the localized-ticket cases in special-requests.spec.ts, not locale-sweep.spec.ts. That spec already owns the host-ticket fixture (Bob, res_e2e_002, desktop sidebar), and locale-sweep stores the guest key (`mbe-booking-widget-locale`), not the staff key this ticket follows. Both specs are already in the E2E workflow, so this adds no wiring."
  - "No docs/standards.json exists in this repo, so no standards statement was cited."
  - "Translation judgement is a reviewer's reading against the catalog's own conventions, not a native-speaker review. Both catalogs are marked machineTranslated: true and the picker says so."
---

# Review: one source for the Special Requests copy

## Scope

`git diff origin/main...HEAD` on PR #7016. Base `6ede6b9df`. Head at review start `ea7f502a1`. The change sits in `ae4ff8be8` (source, tests, catalogs, regenerated `llms*.txt`); the rest is the run's records. Code paths examined in full:

- `apps/hospitality/src/components/timeline/SpecialRequestsTicket.tsx`, plus its callers `ReservationDetails.tsx` and `ReservationSheet.tsx` (unchanged; both render the same component)
- `apps/hospitality/src/i18n/catalogs/{en-US,es-MX,fr-CA}.json` (`bookingWidget.specialRequests.hostCaption`); `en-GB.json` (unchanged, `{}`)
- the deleted `constants/confirmation-copy.ts`, `confirmation-copy.test.ts` and `confirmation-copy.source.test.ts`, and their replacements `src/i18n/special-requests-copy{,.source}.test.ts`
- seven retargeted unit test files and `e2e/special-requests.spec.ts`
- `src/i18n/runtime.tsx` (i18next config: `interpolation.escapeValue: false`, `fallbackLng: en-US`, lazy catalog loaders, `<html lang>` setter) and `src/i18n/locales.ts`, read for context

Review's own fixes landed as `eb7b6ebe7` (test-only, see findings).

## Findings

No critical or major findings. Three minor findings were fixed in place, and two carried-over items stay deferred.

### Minor: the `$t()` nesting guard listed its locales by hand, so a new catalog could retype the caption unseen

- Scenario: `special-requests-copy.test.ts` ran "nests the key and does not retype the sentence" over a fixed `[en-US, es-MX, fr-CA]` list. Suppose a translator later adds a fifth catalog (a new `LocaleTag` plus its loader in `runtime.tsx`) and writes `hostCaption` as a full sentence in that language. The SC4 source guard does not catch it, because it only looks for the en-US sentence. `check-i18n-catalogs.mjs` checks `{{placeholder}}` parity, not `$t()` nesting. The nesting test never sees the new file. The guest's sentence and the host's quote of it could then diverge in that locale. That is the very defect class this run closes. A retype inside es-MX or fr-CA was already caught; this hole was only for locales added later.
- Standard: none
- Decision: **fixed** (`eb7b6ebe7`). The test now reads every `*.json` under `src/i18n/catalogs/` and checks each catalog that writes a `hostCaption`. A coverage case requires en-US, es-MX and fr-CA to be among them, so the check cannot pass with nothing to check. Probe: a throwaway `zz-ZZ.json` with a retyped caption, and es-MX retyped in full, each failed their case; both were reverted (verification.md re-check).

### Minor: the en-GB case pinned absence while its title promised fallback

- Scenario: `en-GB omits the keys and falls back to en-US` asserted only `JSON.stringify(enGB)` does not contain `"hostCaption"`. A correct future en-GB caption (for example British single quotes around the same `$t()` nest) would fail it, which is a false red. A broken fallback would pass it, because the fallback was never exercised.
- Standard: none
- Decision: **fixed** (`eb7b6ebe7`). The case now resolves `bookingWidget.specialRequests.hostCaption` through the app's i18next instance in en-GB and expects the en-US caption. If en-GB ever writes its own caption, the generalized nesting check above holds it to the same rule.

### Minor: no committed browser test opened the ticket outside en-US

- Scenario: the defect was "no test mounts the ticket under a non-en-US locale". Implement's jsdom cases fixed that for the component, but they inject the bundle with `addResourceBundle`. So the real path stayed untested in committed code: the lazy `import("./catalogs/es-MX.json")` loader, the staff key `mbe-hospitality-locale`, `<html lang>`, and the nested `$t()` resolving against a lazily loaded bundle. Verify proved that path only with a throwaway spec. `locale-sweep.spec.ts` stores the guest key and never opens a ticket. A regression in that path, for example a loader that resolves the caption before the bundle lands, would ship with every committed test green.
- Standard: none
- Decision: **fixed** (`eb7b6ebe7`). Two cases in `special-requests.spec.ts` (`desktop sidebar in es-MX|fr-CA: label and caption follow the staff locale`) store the staff locale and open Bob's ticket. They expect `<html lang>` to equal the locale, the group to be named by that catalog's `label`, and the caption to be that catalog's `hostCaption` with its own acknowledgement composed in. Expected strings come from the catalogs; nothing is retyped. RED check: with the ticket pinned to en-US, both failed on the missing localized group. 21/21 green on port 3061.

### Minor (carried, deferred): `remembered-on-arrival/architecture.md` still names the retired constant as the copy source

- Scenario: a reader following that architecture doc (lines ~6, 37, 52, 84, 154) looks for `constants/confirmation-copy.ts`, which no longer exists. The doc's copy-source contract has decayed.
- Standard: none
- Decision: **deferred**. The orchestrator scoped it out: `**/architecture.md` is a gate path in `.claude/implement-queue.md` and would force a human merge of the whole PR. It is recorded as a docs-only, human-merged follow-up in `defect.md` Notes and in verification criterion 10. No code, test or generated file names the constant (`git grep` empty).

### Minor (carried, deferred): no honesty word list for the es-MX / fr-CA copy

- Scenario: SC8's banned-word list runs on en-US only. A future machine retranslation could put an overclaim (for example "garantizado" or "confirmé") into es-MX or fr-CA and no test would fail.
- Standard: none
- Decision: **deferred**. The brief puts it out of scope (remembered-on-arrival review finding 3). Review hand-checked the two captions this run adds: `Los invitados ven esto con: “…”` and `Les clients voient ceci avec : « … »`. Neither says more than the en-US "Guests see this with:". There is no promise, no "confirm", and no "guarantee"; each only says what guests are shown, and quotes the already-reviewed acknowledgement ("Anotado." / "C’est noté.", i.e. "noted").

## Domain checks the Owner asked for

- **i18n correctness: tone, terms and typography.** Both captions are third person and neutral. That suits a staff-facing caption and avoids the es-MX tú/usted choice. The terms match each catalog: es-MX uses "invitados" for guests 21 times (onboarding, settings, guest lists), and fr-CA uses "clients" (onboarding intro, nav, guests page). The typography matches existing entries: es-MX uses curly “…” as in `reservations.search.matching` (`:823`), and fr-CA uses « … » with plain spaces and a spaced colon, as in its 35 other ` :` entries and its `« {{name}} »` entries. "ven esto con:" is a close, slightly literal rendering of "see this with:", acceptable for a catalog the picker already marks as machine-translated. Neither caption claims more than en-US does.
- **en-GB fallback.** en-GB stays `{}`. With `fallbackLng: en-US`, the label, acknowledgement and caption resolve to en-US, and the nested `$t()` resolves in en-GB and then falls back too. This is now pinned by a resolving test (finding 2).
- **`$t()` robustness against a retype.** If an en-US sentence is retyped anywhere under `src/` (`.ts`/`.tsx`/`.json`), the source guard catches it (Verify criterion 2). If a non-English caption is retyped instead of nested, the nesting test catches it, now for every catalog (finding 1). One residual is noted, not a finding: a translator could nest a different key, or nest correctly with wrong surrounding words. The resolve tests for es-MX and fr-CA catch the first ("contains its own acknowledgement"); the second is translation quality.
- **Test retargeting lost nothing meaningful.** Diffed old against new. The old source guard had four cases; all four survive, retargeted and widened to `.json`. In the old copy test, the label, acknowledgement (straight apostrophe), caption (curly quotes, now resolved through i18next), contact line and both SC8 honesty lists all survive. Two assertions were retired: `guest catalog copy matches CONFIRMATION_COPY` (label and acknowledgement equality) and `CONFIRMATION_COPY is frozen`. The first pinned two sources equal. With one source it is vacuous, and the stronger one-source guard replaces it. The second tested immutability of an object that no longer exists; catalog JSON has no runtime mutation path through `t()`. Both retirements are correct. The seven retargeted test files swap `CONFIRMATION_COPY.*` for the matching `enUS.bookingWidget.specialRequests.*`, assertion for assertion.
- **Accessibility of the ticket is unchanged.** The DOM is the same: `role="group"` with `aria-labelledby` pointing at the label `Text`'s `useId` id, the caption as a `div` `Text`, and the guest's words in `dir="auto"`. Only the text source changed. The ticket has no heading; the `h3`/`h2` belong to the guest cards (`ConfirmationView`, `ManageReservationPage`), whose tests still assert them by the same label. On language: the caption quotes the acknowledgement in the staff locale, which is `<html lang>`, so no inline `lang` span is needed. Before this fix the ticket was English inside a `lang="es-MX"` page, which was itself a wrong-language accessibility defect, and that is now gone. The new E2E asserts `<html lang>` (finding 3).
- **Visual Regression (hospitality) red is pre-existing.** PR run `39045775211` (`cd876177a`) and main push run `39018517789` (`1bb58e903`) fail on the same nine snapshots: `/ @1280x720`, `admin @1280x720` and `@375x812`, `onboarding @375x812`, `reservations @1280x720` and `@375x812`, `reservations/manage @1280x720` and `@375x812`, and `timeline @1280x720`. `visual.spec.ts` builds its reservations with `notes: null` (`:82`, `:99`, `:154`) and never clicks one open (no `click`/`press` in the file), so `SpecialRequestsTicket` renders in no baseline. The en-US label and caption are byte-identical to the retired constant (Verify criterion 4). The run on the current head, `39046664306`, was still in progress at review time.

## Passes with no findings

- **Correctness:** clean apart from the test-robustness findings above. i18next 26.4.3 resolves `$t(...)` with the default nesting prefix. `escapeValue: false` is safe here because React escapes text children and the nested value comes from the catalog, never from user input. The guest's `notes` still render as a text child through `specialRequestsText`. `useTranslation()` is called before the early `return null`, so hook order is stable.
- **Design:** matches the hospitality localization conventions (catalog-first, `useTranslation().t`, en-US source, es-MX/fr-CA full parity, en-GB difference-only). The one decayed contract, architecture.md, is the deferred finding above. No decision here needs a new ADR: putting copy in the catalog is what the localization series already decided, and nesting by key is an implementation detail of it.
- **Security:** clean. No new input, endpoint, storage or secret. The E2E reads a repo file with `readFileSync`.
- **Complexity (lean cut-list):** no confirmed cuts. The deleted constants module is the `dead`/`reuse` cut this run exists to make. The E2E's `specialRequestsCopy` helper resembles `locale-sweep.spec.ts`'s `loadCatalog`, but importing across spec files is not this repo's pattern, and the two read different shapes. That is a suspicion at most, not a `reuse` finding. The diff adds no `lean:` markers.
- **ADR compliance:** `adr_status.py` lists ADR-0001 to ADR-0028, all `unrecognized` standing (the repo's own status words). ADR-028 (rialto localization through context) and ADR-001 (Rialto over Tailwind) are the only ones whose subject the diff could reach. Neither is violated: no rialto source changed, and the ticket still uses rialto `Stack`/`Text` with `var(--rialto-*)` styles untouched. The rest are out of scope (API, auth, edge, CI, data, agent tooling). The pre-commit `check-adr` reported no violations.
- **Domain passes:** none selected. No changed path matches payments, migrations or dependencies. `llms*.txt` and the catalog JSON are not manifests.

## Verdict

**Ready to ship.** There are no critical or major findings. Three minor findings were fixed in place (`eb7b6ebe7`, test-only), and the affected gates were re-run green: lint, typecheck, `Tests 2983 passed`, E2E 21/21 on :3061, and `regen --check` clean. Two minors stay deferred with reasons: the architecture.md follow-up (human-merged) and es-MX/fr-CA honesty lists (out of scope per brief). CI Gate must be green again on the new head before merge. Because `e2e/special-requests.spec.ts` changed, the merge gate's diff-matched `e2e-selector-drift-reviewer` applies.
