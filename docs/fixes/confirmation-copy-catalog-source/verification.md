---
stage: verify
run: maintenance:confirmation-copy-catalog-source
date: 2026-10-17
assumptions:
  - "Criteria list. A maintenance run has no prd.md, so the criteria are the defect brief's Expected statements and work-item acceptance criteria (defect.md), plus the remembered-on-arrival SCs this change could regress (SC1-SC3, SC5, SC7, SC8). Taken as the skill's default for maintenance runs: the regression test from the reproduction evidence is the centerpiece."
  - "E2E harness: the remembered-on-arrival precedent recipe (verification.md frontmatter), on this stage's own port. Scratch config outside the repo (session scratchpad `e2e-verify/playwright.verify.config.ts`), `pnpm exec vite --port 3051 --strictPort` from `apps/hospitality`, `VITE_AUTH_AUTHORITY=https://e2e-local.auth0.invalid`, `VITE_AUTH_CLIENT_ID=e2e-local-client`, `VITE_API_URL=http://localhost:3051`, a synthetic unsigned OIDC session (`oidc.user:https://e2e-local.auth0.invalid:e2e-local-client`, `expires_at` 4102444800) in the gitignored `e2e/.auth/user.json` (`git check-ignore -v` -> `apps/hospitality/.gitignore:1:e2e/.auth/`), 1 worker, 0 retries, no setup project, `TZ=UTC`. No Auth0 credentials. Afterwards the session file, the scratch test-results and the two untracked screenshots the run wrote (`e2e/screenshots/timeline-interaction-{date-nav,grid}.png`) were deleted. Nothing from the harness is committed."
  - "`locale-sweep.spec.ts` renders the timeline with `notes: null` and never opens a ticket, so it cannot see the localized ticket. To cover the brief's 'plus locale-sweep for the ticket' intent in a real browser, this stage ran a throwaway spec (`e2e/zz-verify-ticket-locale.spec.ts`, deleted after the run, never committed) on the same harness. It is evidence, not a committed test."
  - '`Visual Regression (hospitality)` (`apps-visual.yml`) is red on PR #7016. It is advisory (not in `ci-gate` needs; required contexts are `["CI Gate"]`), and the same workflow is red on `main` pushes `546d1d44b`, `53e882fdd` and `1bb58e903` earlier the same day, so it is pre-existing and not attributed to this change. Not investigated further here.'
---

# Verification: one source for the Special Requests copy

## Summary

10 criteria checked, 10 PASS, 0 FAIL. Every number below comes from a run made in this stage, at `cd876177a` (PR #7016 head), base `origin/main` `6ede6b9df`, Node v22.22.3. Implement's numbers were not reused. The acknowledgement sentence now appears as a literal in one non-test file. A retyped copy in any `.json` under `src/` makes the guard fail. The host ticket shows the catalog label and caption in es-MX and fr-CA, and each caption contains that locale's acknowledgement. Both hold in jsdom and in a real browser. The en-US caption is byte-identical to the retired constant. Guest surfaces and the remembered-on-arrival SCs still hold. Gates are green, and CI Gate is green on the PR.

## Criteria & evidence

### 1. The defect is gone: one non-test literal (defect 1, work item 3)

- Check: `git grep` for the sentence and the apostrophe-free fragment over `apps/hospitality/src`, tests and specs excluded. Then the same grep with tests included, and a grep for the retired constant across the app and the root llms files.
- Evidence:
  ```
  $ git grep -n "Noted. It\|on your reservation for the team" -- apps/hospitality/src ':!*.test.*' ':!*.spec.*'
  apps/hospitality/src/i18n/catalogs/en-US.json:1199:      "acknowledgement": "Noted. It's on your reservation for the team.",

  $ git grep -n "Noted. It\|on your reservation for the team" -- apps/hospitality ':!*llms*'
  apps/hospitality/src/i18n/catalogs/en-US.json:1199:      "acknowledgement": "Noted. It's on your reservation for the team.",
  apps/hospitality/src/i18n/special-requests-copy.source.test.ts:24:const FRAGMENT = "on your reservation for the team";
  apps/hospitality/src/i18n/special-requests-copy.test.ts:33:    expect(acknowledgement).toBe("Noted. It's on your reservation for the team.");
  apps/hospitality/src/i18n/special-requests-copy.test.ts:38:      "Guests see this with: “Noted. It's on your reservation for the team.”"

  $ git grep -n "CONFIRMATION_COPY\|constants/confirmation-copy" -- apps/hospitality llms.txt llms-full.txt
  (no output, exit 1)
  ```
- Result: PASS. The only non-test hit is `en-US.json:1199`. The two test hits are the intended literal pins.

### 2. The guard sees JSON (defect 1, work item 1 hand probe)

- Check: Implement probed `src/i18n/catalogs/zz-probe.json`. This stage used a different location outside the catalogs: a throwaway `src/zz-verify-probe.json` holding the retyped sentence. Ran the guard, deleted the file, ran the guard again.
- Evidence:
  ```
  {"retyped":"Noted. It's on your reservation for the team."}
       ✓ the fragment guard still matches the acknowledgement 1ms
       × only the en-US catalog contains the acknowledgement sentence 15ms
       ✓ the en-US catalog writes the sentence exactly once 0ms
       × only the en-US catalog contains the apostrophe-free fragment 13ms
    zz-verify-probe.json: expected [ 'i18n/catalogs/en-US.json', …(1) ] to deeply equal [ 'i18n/catalogs/en-US.json' ]
  +   "zz-verify-probe.json",
   Test Files  1 failed (1)
        Tests  2 failed | 2 passed (4)
  --- after delete
  ls: src/zz-verify-probe.json: No such file or directory
   ✓ src/i18n/special-requests-copy.source.test.ts (4 tests) 27ms
        Tests  4 passed (4)
  ```
- Result: PASS.

### 3. Host ticket follows the staff locale (defect 2, work item 2)

- Check (committed tests): `SpecialRequestsTicket.test.tsx` and `special-requests-copy.test.ts`, verbose.
- Evidence:
  ```
  ✓ SpecialRequestsTicket in es-MX > names the group with the catalog label
  ✓ SpecialRequestsTicket in es-MX > quotes that locale's acknowledgement verbatim in the caption
  ✓ SpecialRequestsTicket in fr-CA > names the group with the catalog label
  ✓ SpecialRequestsTicket in fr-CA > quotes that locale's acknowledgement verbatim in the caption
  ✓ host caption nests the acknowledgement by key > en-US nests the key and does not retype the sentence
  ✓ host caption nests the acknowledgement by key > es-MX nests the key and does not retype the sentence
  ✓ host caption nests the acknowledgement by key > fr-CA nests the key and does not retype the sentence
  ✓ host caption nests the acknowledgement by key > es-MX resolves to a caption containing its own acknowledgement
  ✓ host caption nests the acknowledgement by key > fr-CA resolves to a caption containing its own acknowledgement
  ✓ host caption nests the acknowledgement by key > en-GB omits the keys and falls back to en-US
  ```
- Check (independent render, throwaway): a scratch vitest file rendered the real `SpecialRequestsTicket` through the app's `localeRuntime`. It printed the group's label and caption text in each locale. Both throwaway files were deleted afterwards, and `git status` was clean.
- Evidence:
  ```
  VERIFY es-MX label="Peticiones especiales" caption="Los invitados ven esto con: “Anotado. Ya está en tu reserva para el equipo.”"
  VERIFY fr-CA label="Demandes spéciales" caption="Les clients voient ceci avec : « C’est noté. C’est inscrit à votre réservation pour l’équipe. »"
        Tests  3 passed (3)
  ```
- Check (real browser, throwaway spec on the 3051 harness): set the staff locale key `mbe-hospitality-locale`, opened Bob's ticket (`res_e2e_002`, notes "Birthday celebration") in the desktop sidebar, located the group by the catalog label, and read its text.
- Evidence:
  ```
  VERIFY-E2E es-MX lang=es-MX group="PETICIONES ESPECIALES\nLos invitados ven esto con: “Anotado. Ya está en tu reserva para el equipo.”\nBirthday celebration"
  VERIFY-E2E fr-CA lang=fr-CA group="DEMANDES SPÉCIALES\nLes clients voient ceci avec : « C’est noté. C’est inscrit à votre réservation pour l’équipe. »\nBirthday celebration"
  VERIFY-E2E en-US lang=en-US group="SPECIAL REQUESTS\nGuests see this with: “Noted. It's on your reservation for the team.”\nBirthday celebration"
    3 passed (7.0s)
  ```
  (The capitals come from the label variant's CSS `text-transform`, which `innerText` reflects. The accessible name matched the catalog label as written.)
- Result: PASS.

### 4. en-US caption is byte-identical to the pre-change constant (work item 3)

- Check: wrote `git show origin/main:apps/hospitality/src/constants/confirmation-copy.ts` back out as a throwaway module. Rendered the new ticket in en-US and compared label and caption to the old `CONFIRMATION_COPY` values with `Buffer.equals`. The module was deleted afterwards.
- Evidence:
  ```
  VERIFY en-US label="Special Requests" caption="Guests see this with: “Noted. It's on your reservation for the team.”"
  VERIFY old   label="Special Requests" caption="Guests see this with: “Noted. It's on your reservation for the team.”"
   ✓ src/zz-verify-render.test.tsx (3 tests) 87ms
  ```
- Result: PASS.

### 5. Guests did not regress: remembered-on-arrival SC1-SC3, SC5, SC7, SC8

- Check: the surface and copy tests, verbose (`ConfirmationView`, `ManageReservationPage`, `BriefingPage`, `ReservationDetails`, `ReservationSheet`, `SpecialRequestsTicket`, `GuestDetailsForm`, `special-requests-copy*.test.ts`): `Test Files 9 passed (9)`, `Tests 220 passed (220)`. The diff for these files only swaps `CONFIRMATION_COPY.*` for the matching `enUS.bookingWidget.specialRequests.*`, and no assertion was dropped. Tests pinning each SC:
- Evidence:
  ```
  SC1  ✓ ConfirmationView Special Requests card > names the group by its h3 and says the acknowledgement
       ✓ ConfirmationView Special Requests card > renders the guest's words as one text node, line break kept, dir=auto
       ✓ [e2e] special-requests.spec.ts:192 › confirmation: the guest's line break is a real line break
  SC2  ✓ ManageReservationPage Special Requests card > names the group by its h2 and says the acknowledgement
       ✓ ManageReservationPage Special Requests card > renders the guest's words as one text node, line break kept, dir=auto
       ✓ [e2e] special-requests.spec.ts:211 › manage page: the guest's line break is a real line break
  SC3  ✓ SpecialRequestsTicket > names the group Special Requests and shows what guests are told
       ✓ ReservationDetails > Special Requests (remembered-on-arrival SC3) > shows the guest's request under Special Requests, not Notes
       ✓ ReservationSheet > More ▾ (A5.3 sheet half, P13) > shows Special Requests before More, and reveals the GuestCard, email and phone only once expanded
       ✓ BriefingPage > Special Requests (remembered-on-arrival SC3) > labels the guest's words as one text node inside a Special Requests group
       ✓ [e2e] special-requests.spec.ts:224 › desktop sidebar: Special Requests with the host caption and the guest's words
       ✓ [e2e] special-requests.spec.ts:236 › tablet sheet at 1024×768: the request is in view without pressing More
  SC5  ✓ ConfirmationView Special Requests card > renders no block, label, line or card for null / "" / "   " / "\n\t "
       ✓ ManageReservationPage Special Requests card > renders no block, label, line or card for null / "" / "   " / "\n\t "
       ✓ ReservationDetails > ... > shows no group and no label for null / "" / "   " / "\n\t "
       ✓ BriefingPage > ... > shows no group and no label for null / "" / "   " / "\n\t "
       ✓ SpecialRequestsTicket > renders nothing at all for null / "" / "   " / "\n\t "
       ✓ ReservationSheet > ... > stays compact with no group for whitespace-only notes
  SC7  ✓ ConfirmationView > tells the truth about sends, naming the email, when guestEmail exists
       ✓ ConfirmationView > tells the truth about sends, naming the phone, when only guestPhone exists
       ✓ ConfirmationView > names the email when both an email and a phone exist
       ✓ ConfirmationView > no contact line when there is neither an email nor a phone
       ✓ en-US Special Requests copy > contactLine > interpolates the contact into the honest sentence
       ConfirmationView.test.tsx:203/214/225/236  expect(screen.queryByText(/A confirmation has been sent/)).toBeNull();
  SC8  ✓ honesty limits (SC8) > acknowledgement and host caption never say "guarantee" | "confirm" | "reserved" | "arranged" | "kitchen" | "chef" | "will " | "taken care"
       ✓ honesty limits (SC8) > contact line never says "has been sent" | "we've sent" | "check your" | "will receive"
  ```
- Result: PASS.

### 6. Gates in `apps/hospitality`

- Check: `pnpm lint`, `pnpm typecheck`, `pnpm test`, each run on its own. Lint output was also grepped for every file this PR touches under `src/` and `e2e/`.
- Evidence:
  ```
  lint exit 0
  ✖ 145 problems (0 errors, 145 warnings)
  (warnings naming a file touched by this PR: none)

  typecheck exit 0
  > tsc --noEmit -p tsconfig.test.json && tsc --noEmit -p tsconfig.e2e.json

  test exit 0
   Test Files  222 passed (222)
        Tests  2982 passed (2982)
  ```
- Result: PASS.

### 7. Catalog check and generated artifacts (work items 3, 5)

- Check: `node scripts/check-i18n-catalogs.mjs`. Then `pnpm regen --check` from the root. `agent-core-build-freshness` was confirmed `fresh` first, so the llms check is not a missing-build false result.
- Evidence:
  ```
  PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.
  i18n exit 0

  {"trusted":true,"state":"fresh","reason":"dist is newer than or equal to every src file",...}
  > node scripts/regen.mjs "--check"
  All generated artifacts are up to date.
  regen rc=0
  ```
- Result: PASS.

### 8. E2E: special-requests, timeline-interaction, locale-sweep (work item 6)

- Check: `TZ=UTC pnpm exec playwright test -c <scratch>/playwright.verify.config.ts special-requests.spec.ts timeline-interaction.spec.ts locale-sweep.spec.ts` on this stage's own Vite at port 3051 (`--strictPort`, never :3002), with the harness from `assumptions`.
- Evidence:
  ```
  e2e rc=0
    ✓  119 [chromium] › e2e/special-requests.spec.ts:224:3 › The host ticket carries the same words › desktop sidebar: Special Requests with the host caption and the guest's words (2.0s)
    ✓  120 [chromium] › e2e/special-requests.spec.ts:236:3 › The host ticket carries the same words › tablet sheet at 1024×768: the request is in view without pressing More (2.1s)
    ✓  132 [chromium] › e2e/timeline-interaction.spec.ts:260:3 › ... › at 1024×768 a party with Special Requests opens the taller sheet and the grid clears all of it (2.0s)
    ✓  133 [chromium] › e2e/timeline-interaction.spec.ts:273:3 › ... › at 1024×768 pressing More grows the sheet and the grid still clears all of it (2.9s)

    133 passed (4.3m)
  ```
  Per spec, counted from the list output: `special-requests.spec.ts` 6, `timeline-interaction.spec.ts` 13, `locale-sweep.spec.ts` 114. es-MX and fr-CA `timeline @ 375x812` and `@ 1280x720` passed.
- Result: PASS. The real-browser check of the localized ticket is under criterion 3, because locale-sweep never opens a ticket (see `assumptions`).

### 9. PR #7016 CI

- Check: `node scripts/ci-gate-status.mjs check --pr 7016` and the PR rollup.
- Evidence:
  ```
  {"state":"green","reason":"CI Gate succeeded"}
  ci rc=0
  headRefOid: cd876177aa7a94c4009003e47e64f33c77af429c  state: OPEN  mergeStateStatus: UNSTABLE
  not green: Capture E2E Screenshots (IN_PROGRESS), Hospitality E2E (IN_PROGRESS), Visual Regression (hospitality) (FAILURE)
  apps-visual.yml on main: failure 546d1d44b, failure 53e882fdd, failure 1bb58e903 (2026-10-17, before this PR)
  ```
- Result: PASS on the required gate. `UNSTABLE` comes from the advisory visual job, which is already red on `main`, and two advisory jobs still running when checked.

### 10. The orchestrator's scope deferral is recorded (architecture.md)

- Check: read `defect.md`.
- Evidence: the `assumptions:` entry "(Orchestrator, Implement re-entry 2026-10-17) Work item 5's edit to `docs/features/remembered-on-arrival/architecture.md` is NOT made in this PR ... listed under Notes as a separate, human-merged docs-only follow-up". Notes also carries the item: "**Follow-up (docs-only, human-merged; orchestrator scope change):** update `docs/features/remembered-on-arrival/architecture.md` lines ~6, 37, 52, 84 and 154 ...". Outside this run's directory, `git grep -l "confirmation-copy.ts\|CONFIRMATION_COPY"` lists only `docs/features/remembered-on-arrival/{architecture,breakdown,release,review,verification}.md`. That is the deferred architecture.md plus four historical run records. No code, test or generated file matches.
- Result: PASS.

## Failures

None.

## Not verified

- **Production.** The change is not merged or deployed. The host ticket is behind Auth0, and no credentials are available. Ship owns the Deploy Static Sites job-level record.
- **The real Auth0 E2E path.** That path runs only in CI's advisory `Hospitality E2E` job, still in progress when checked. This stage used a synthetic session.
- **The tablet sheet and phone drawer in es-MX/fr-CA.** The localized real-browser check covered the desktop sidebar only. The sheet and drawer render the same `SpecialRequestsTicket` component (`ReservationSheet.tsx`), and jsdom covers that component in both locales.
- **es-MX / fr-CA honesty word list (SC8 in translation).** Out of scope per the brief (review finding 3, follow-up). The new es-MX and fr-CA captions are machine translations and were not checked against a translated banned-word list.
- **`Visual Regression (hospitality)`.** Red and advisory, as already red on `main`. Not investigated (see `assumptions`).
- **`docs/features/remembered-on-arrival/architecture.md`** still names `constants/confirmation-copy.ts` as the copy source. This is deferred by the orchestrator to a human-merged follow-up (criterion 10). Until that lands, work item 5's "no doc names it as the live source" holds for code and generated artifacts only.
