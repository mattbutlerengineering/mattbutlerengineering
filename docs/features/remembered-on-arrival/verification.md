---
stage: verify
run: feature:remembered-on-arrival
date: 2026-10-16
verified-commit: 0bc8f0c27 (origin/main; contains the #6355 squash f3725682c)
assumptions:
  - "Verify grades the code on main at 0bc8f0c27, not the #6355 branch (brief § Resume 2026-10-16). Five later commits rewrote surfaces this run touched, chiefly the localization series #6706, #6721, #6728, #6735, #6739. Where they changed what a criterion measures, the result below says so."
  - "Local E2E ran through the architecture's § Verify's E2E path recipe (booking-guest-reuse precedent): a scratch config outside the repo, Vite on port 3017 with --strictPort, a synthetic unsigned OIDC session written to the gitignored e2e/.auth/user.json (authority https://e2e-local.auth0.invalid), VITE_API_URL pointed at the harness port, 1 worker and 0 retries. There is no setup project, and no Auth0 credentials were used. The session file and the run's screenshots were deleted afterwards. Nothing from the harness is committed."
  - "The production probe used the slug `the-oak-table` (from hospitality-service-ux release.md) for the public booking page. Prod answers `Venue not found` for it, and no live venue slug is recorded anywhere in the repo. The probe therefore exercises the page shell, its CSP and the served bundle, but not a rendered venue."
---

# Verification: Remembered on arrival

## Summary

Of 12 PRD criteria plus the breakdown's E2E clearance criterion, **11 pass**, **1 fails as literally written** (SC4's "one non-test source file" grep), and **1 passes with a recorded evidence gap** (SC11). Every automated gate is green on `main`. Production serves the new copy, and the old false line is gone from the served bundle. The SC4 failure is drift after merge, not a defect in #6355. The localization run (#6735) copied the acknowledgement into the en-US message catalog, so the sentence is now a literal in two non-test files. A test pins the two copies to each other, so the words cannot drift. The criterion's literal check no longer holds, though, and the committed guard only scans `.ts`/`.tsx`, so it cannot see the second copy. Verdict: the feature works as specified. SC4's wording and guard need a human decision (see Failures).

## Criteria & evidence

### SC1 ConfirmationView says the request back

- Check: vitest component tests (`ConfirmationView.test.tsx`), plus the real-browser line-break check in `special-requests.spec.ts` at 375 px.
- Evidence:
  ```
  ✓ ConfirmationView Special Requests card > names the group by its h3 and says the acknowledgement
  ✓ ConfirmationView Special Requests card > renders the guest's words as one text node, line break kept, dir=auto
  ✓ ConfirmationView Special Requests card > sits after Reservation Details and before the Deposit card
  ✓ [chromium] › e2e/special-requests.spec.ts:179:3 › Guest pages say the Special Requests back (375 px) › confirmation: the guest's line break is a real line break (1.7s)
  ```
  Current source (`ConfirmationView.tsx:161-175`): `role="group" aria-labelledby={specialRequestsId}`, label and acknowledgement read from `t("bookingWidget.specialRequests.label" / ".acknowledgement")`, words in `<Text … dir="auto" className={styles.requestsText}>`.
- Result: PASS

### SC2 ManageReservationPage says the request back

- Check: vitest (`ManageReservationPage.test.tsx`, real api client plus `mockFetch`), plus the E2E manage-page line-break check.
- Evidence:
  ```
  ✓ ManageReservationPage Special Requests card > names the group by its h2 and says the acknowledgement
  ✓ ManageReservationPage Special Requests card > renders the guest's words as one text node, line break kept, dir=auto
  ✓ ManageReservationPage Special Requests card > moves the request out of the details card, so the group appears once
  ✓ ManageReservationPage Special Requests card > sits after the details card and before Add to Calendar
  ✓ ManageReservationPage Special Requests card > still shows the group on a CANCELLED reservation
  ✓ [chromium] › e2e/special-requests.spec.ts:198:3 › … › manage page: the guest's line break is a real line break (1.4s)
  ```
- Result: PASS

### SC3 Host ticket: sidebar, phone drawer, tablet sheet, Briefing

- Check: vitest (`SpecialRequestsTicket`, `ReservationDetails`, `ReservationSheet`, `BriefingPage`, `TimelinePage`), plus the host half of `special-requests.spec.ts` on the `mockApi` harness.
- Evidence:
  ```
  ✓ SpecialRequestsTicket > names the group Special Requests and shows what guests are told
  ✓ ReservationDetails > Special Requests (remembered-on-arrival SC3) > shows the guest's request under Special Requests, not Notes
  ✓ ReservationSheet > More ▾ (A5.3 sheet half, P13) > shows Special Requests before More, and reveals the GuestCard, email and phone only once expanded
  ✓ ReservationSheet > Special Requests above the actions (remembered-on-arrival M4.3) > opens at the default height with notes; More changes only aria-expanded and the revealed rows
  ✓ ReservationSheet > Special Requests above the actions (remembered-on-arrival M4.3) > puts the group before Seat Guest
  ✓ BriefingPage > Special Requests (remembered-on-arrival SC3) > labels the guest's words as one text node inside a Special Requests group
  ✓ BriefingPage > Special Requests (remembered-on-arrival SC3) > keeps the staff note outside the group, with no label of its own
  ✓ [chromium] › e2e/special-requests.spec.ts:211:3 › The host ticket carries the same words › desktop sidebar: Special Requests with the host caption and the guest's words (1.8s)
  ✓ [chromium] › e2e/special-requests.spec.ts:223:3 › The host ticket carries the same words › tablet sheet at 1024×768: the request is in view without pressing More (2.4s)
  ```
- Result: PASS

### SC4 One copy source

- Check: the committed copy tests, the committed source guard, and the PRD's literal grep (`git grep` over every non-test file under `apps/hospitality/src`).
- Evidence:
  ```
  ✓ confirmation-copy.test.ts > guest catalog copy matches CONFIRMATION_COPY > uses the same Special Requests label
  ✓ confirmation-copy.test.ts > guest catalog copy matches CONFIRMATION_COPY > uses the same acknowledgement
  ✓ confirmation-copy.test.ts > CONFIRMATION_COPY > pins the acknowledgement, with a straight apostrophe
  ✓ confirmation-copy.test.ts > CONFIRMATION_COPY > pins the host caption, quoting the acknowledgement in curly quotes
  ✓ confirmation-copy.source.test.ts > SC4 guard: the acknowledgement is written once > only confirmation-copy.ts contains the acknowledgement sentence

  $ git grep -l "Noted. It's on your reservation for the team." -- apps/hospitality/src ':!*.test.*'
  apps/hospitality/src/constants/confirmation-copy.ts
  apps/hospitality/src/i18n/catalogs/en-US.json
  ```
  `git log f3725682c..HEAD -- src/constants/confirmation-copy.ts …` lists `ca1c38606 feat(hospitality): translate guest booking surfaces (es-MX, fr-CA) (#6735)` and the rest of the localization series. Since that series, the guest pages read the catalog (`bookingWidget.specialRequests.*`, `bookingWidget.confirmation.contactLine`) and the host ticket reads `CONFIRMATION_COPY`. `contactLine()` is no longer exported from the constant; the test rebuilds it from the catalog. The source guard filters to `/\.(ts|tsx)$/`, so it cannot see the JSON copy.
- Result: **FAIL as written** (two non-test files hold the literal; the PRD asks for exactly one). The intent holds: the en-US catalog is pinned equal to `CONFIRMATION_COPY` by a passing test, so guest and host en-US wording cannot drift silently. See Failures.

### SC5 Empty renders nothing

- Check: `it.each` over `null`, `""`, `"   "` and `"\n\t "` on every surface, plus the presence rule and the sheet size.
- Evidence:
  ```
  ✓ specialRequestsText > returns null for null / undefined / "" / "   " / "\n\t "
  ✓ ConfirmationView Special Requests card > renders no block, label, line or card for null | "" | "   " | "\n\t "
  ✓ ManageReservationPage Special Requests card > renders no block, label, line or card for null | "" | "   " | "\n\t "
  ✓ SpecialRequestsTicket > renders nothing at all for null | "" | "   " | "\n\t "
  ✓ ReservationDetails > Special Requests (remembered-on-arrival SC3) > shows no group and no label for null | "" | "   " | "\n\t "
  ✓ BriefingPage > Special Requests (remembered-on-arrival SC3) > shows no group and no label for null | "" | "   " | "\n\t "
  ✓ ReservationSheet > Special Requests above the actions (remembered-on-arrival M4.3) > stays compact with no group for whitespace-only notes
  ```
- Result: PASS

### SC6 Untrusted text stays text

- Check: untrusted-note tests on two guest surfaces and one host surface, plus a `dangerouslySetInnerHTML` grep on the #6355 diff (content only, excluding the commit message) and on `main` now.
- Evidence:
  ```
  ✓ ConfirmationView Special Requests card > keeps untrusted text as literal characters
  ✓ ManageReservationPage Special Requests card > keeps untrusted text as literal characters
  ✓ SpecialRequestsTicket > keeps untrusted text as literal characters
  ✓ specialRequestsText > returns untrusted text character for character

  $ git diff f3725682c^ f3725682c -- apps/hospitality/src | grep -c dangerouslySetInnerHTML
  0
  $ git grep -n dangerouslySetInnerHTML -- apps/hospitality/src
  (no output)
  ```
  (`git show f3725682c | grep` reports one hit, but it is in the squash commit's message, which mentions the grep. It is not code.)
- Result: PASS

### SC7 Honest contact line

- Check: ConfirmationView tests (email, phone-only, both, neither); a grep for the old line in source; the served production bundle (SC11).
- Evidence:
  ```
  ✓ ConfirmationView > tells the truth about sends, naming the email, when guestEmail exists
  ✓ ConfirmationView > tells the truth about sends, naming the phone, when only guestPhone exists
  ✓ ConfirmationView > names the email when both an email and a phone exist
  ✓ ConfirmationView > no contact line when there is neither an email nor a phone
  ✓ confirmation-copy.test.ts > contactLine > interpolates the contact into the honest sentence

  $ git grep -n "A confirmation has been sent" -- apps/hospitality/src
  …ConfirmationView.test.tsx:204/215/226/237:  expect(screen.queryByText(/A confirmation has been sent/)).toBeNull();
  ```
  The phrase appears only in negative assertions in tests. en-US catalog `:1193`: `"contactLine": "No confirmation email or text is sent for this booking, so save these details. The venue has {{contact}} on your reservation."`
- Result: PASS

### SC8 Honesty limits

- Check: the case-insensitive banned-word tests.
- Evidence:
  ```
  ✓ honesty limits (SC8) > acknowledgement and host caption never say "guarantee" | "confirm" | "reserved" | "arranged" | "kitchen" | "chef" | "will " | "taken care"
  ✓ honesty limits (SC8) > contact line never says "has been sent" | "we've sent" | "check your" | "will receive"
  ```
  Scope note: the test checks the en-US copy. The es-MX, fr-CA and en-GB catalog strings added by #6735 are not checked against any equivalent list.
- Result: PASS (en-US)

### SC9 Accessible and legible

- Check: no-live-region tests; group/`aria-labelledby` tests; CSS-text token tests; Playwright `scrollWidth ≤ innerWidth` at 375 px with a 2,000-character note containing a 300-character unbroken run.
- Evidence:
  ```
  ✓ ConfirmationView Special Requests card > is never inside or around a live region
  ✓ ConfirmationView Special Requests card > wraps the words with keyword values only (CSS text)
  ✓ ManageReservationPage Special Requests card > is never inside or around a live region
  ✓ ManageReservationPage Special Requests card > wraps the words and insets the card with tokens (CSS text)
  ✓ SpecialRequestsTicket > holds nothing focusable and no live region
  ✓ [chromium] › e2e/special-requests.spec.ts:168:3 › … › confirmation: a 2,000-character request with a 300-character run causes no sideways scroll (2.1s)
  ✓ [chromium] › e2e/special-requests.spec.ts:187:3 › … › manage page: a 2,000-character request with a 300-character run causes no sideways scroll (1.4s)
  ```
- Result: PASS

### SC10 No excluded change

- Check: the #6355 file list against the PRD's excluded set.
- Evidence:
  ```
  $ git show --name-only --format= f3725682c | grep -E "public-holds|confirm-hold|notif|email|schema.prisma|packages/types|packages/api-client|packages/rialto|pnpm-lock|package.json|\.changeset"
  (no output; grep exit 1)
  ```
  The 44 files are all under `apps/hospitality/`, `docs/`, and the root and hospitality llms pairs.
- Result: PASS

### SC11 Production evidence, honestly bounded

- Check: confirmed that #6355 deployed; probed the public pages with a real browser (Playwright MCP, 375×812); walked the served JS chunk graph and searched it for the copy. No reservation was created and nothing was sent.
- Evidence:
  ```
  Deploy Static Sites run 38190128781 (headSha f3725682c…):
    Deploy Hospitality: success · Post-Deploy Verification: success · Report Deploy Health: success
  $ dig +short mattbutlerengineering.com @1.1.1.1   → 172.67.222.73 / 104.21.25.32 (matches the LAN resolver)

  /hospitality/book/the-oak-table → "Venue not found" (heading level 2)
    console: [ERROR] Failed to load resource: 404 @ https://mattbutlerengineering.com/api/v1/venues/by-slug/the-oak-table
    (no CSP refusal)
  /hospitality/reservations/manage (no token) → "No Access Link"
    console: Total messages: 0 (Errors: 0, Warnings: 0)

  served-bundle walk (76 JS files):
    ack     "Noted. It's on your reservation for the team."            → index-Bd9I8AYX.js, TimelinePage-BuzUz77Z.js
    contact "No confirmation email or text is sent … The venue has "   → index-Bd9I8AYX.js
    caption "Guests see this with:"                                    → TimelinePage-BuzUz77Z.js
    old     "A confirmation has been sent to"                          → (none)
  ```
  After the bundle walk, the console showed four `connect-src` CSP refusals, for `js.stripe.com/endive/stripe.js` and `static.cloudflareinsights.com/beacon.min.js`. **My probe caused these**: its `fetch()` re-requested every resource URL, and `connect-src` blocks that. The page loaded the same URLs as scripts, which CSP allowed. The same page had 0 console messages before the probe ran.
- Not reachable on production: the rendered ConfirmationView (needs a real booking), the rendered manage card (needs a real manage token), and every host surface (behind Auth0). No sanctioned synthetic booking path exists (PRD SC11). No live venue slug is known, so even the booking form's shell was not reached.
- Result: PASS, with the gap recorded above.

### SC12 Gates

- Check: lint, typecheck and test in `apps/hospitality` (the only affected package), plus `pnpm regen --check` from the root after `pnpm build --filter @mbe/cli...`. All run on 0bc8f0c27 after `pnpm install --frozen-lockfile` and `pnpm build --filter @mattbutlerengineering/rialto`.
- Evidence:
  ```
  lint exit=0       ✖ 145 problems (0 errors, 145 warnings)
  typecheck exit=0  tsc --noEmit -p tsconfig.test.json && tsc --noEmit -p tsconfig.e2e.json
  test exit=0       Test Files  220 passed (220)   Tests  2950 passed (2950)
  feature subset    Test Files  12 passed (12)     Tests  331 passed (331)
  regen check exit=0  All generated artifacts are up to date.
  ```
  No changeset was needed: SC10 shows no published-package source in the diff.
- Result: PASS

### Breakdown M4.2 / M4.4: grid clears the tablet sheet (UX-surfaced)

- Check: `sheet-size.test.ts` (including the rialto Drawer drift guard), `TimelinePage` inset tests, and the `timeline-interaction.spec.ts` clearance tests at 1024×768.
- Evidence:
  ```
  ✓ SHEET_BLOCK_SIZE mirrors rialto's bottom Drawer > default matches `.bottom`
  ✓ SHEET_BLOCK_SIZE mirrors rialto's bottom Drawer > compact matches `.compact.bottom`
  ✓ TimelinePage > tablet sheet More state (remembered-on-arrival M4.1) > returns to the compact inset after More, close and reselect
  ✓ [chromium] › e2e/timeline-interaction.spec.ts:260:3 › … › at 1024×768 a party with Special Requests opens the taller sheet and the grid clears all of it (2.4s)
  ✓ [chromium] › e2e/timeline-interaction.spec.ts:273:3 › … › at 1024×768 pressing More grows the sheet and the grid still clears all of it (3.4s)
    19 passed (35.6s)   [special-requests.spec.ts + timeline-interaction.spec.ts]
  ```
- Result: PASS

### Regression sweep: booking-widget and briefing E2E

- Check: `booking-widget.spec.ts`, `booking-widget-calendar.spec.ts` and `briefing.spec.ts` through the same harness.
- Evidence:
  ```
  run 2 (machine TZ America/Los_Angeles): 1 failed, 9 passed
    ✘ briefing.spec.ts:101:3 › buckets on the local hour … (A2)
      Locator: getByText('5:30 PM') … element(s) not found
      (page rendered "8:30 PM", "9:30 PM", "12:00 AM": every time +3 h)
  run 3 (TZ=America/New_York): briefing.spec.ts 4 passed (6.7s)
  ```
  Every time on the page is shifted by exactly 3 hours, Pacific to Eastern. That points to the venue-clock change (#6706, "staff time … on the venue clock"), not this run. The failing assertion reads party times, not the Special Requests group. The spec fails only when the machine timezone is not Eastern. This is a pre-existing environment dependency, recorded here and not routed to this run.
- Result: PASS for this feature (the one red is unrelated and TZ-dependent)

## Failures

- **SC4: the literal grep finds two non-test files.** `apps/hospitality/src/i18n/catalogs/en-US.json:1199` duplicates the acknowledgement. The duplicate arrived after merge, from the localization series (#6735). Equality is test-pinned, so it does not route back to this run's Implement. A human should decide one of two fixes. (a) Amend SC4: the catalog is the guest source, and `CONFIRMATION_COPY` must equal it, which the current test already checks. (b) Widen `confirmation-copy.source.test.ts` to scan `.json` and allow-list the en-US catalog, so a third retype is still caught. Today, a retype into any JSON file under `src/` would pass the guard.

## Not verified

- **Rendered guest surfaces on production.** ConfirmationView and the manage page's Special Requests card could not be reached without a real reservation and token. Creating one was forbidden, and no sanctioned synthetic path exists. The evidence is the served bundle plus local tests and E2E.
- **Host surfaces on production.** They are behind Auth0, and no credentials are available. The evidence is tests and E2E on the mocked session.
- **The real Auth0 E2E path.** It runs only in CI's advisory `Hospitality E2E` job. This run used a synthetic session.
- **Translated copy (es-MX, fr-CA, en-GB).** None of it is checked against the SC8 honesty list. Mixed-language host captions are also unverified: `SpecialRequestsTicket` reads the English `CONFIRMATION_COPY.hostCaption` while guests may have seen a translated acknowledgement, and the Briefing label now reads the catalog. Both are outside this run's PRD (which predates localization); flagged for Review.
- **A local production build and size budgets** (`pnpm build`, `pnpm size`) were not re-run. The served production bundle stood in for SC11's local-bundle half.
- **The CI `ci.yml` run for the merge SHA.** It was not found in the last 200 main runs; only the Deploy Static Sites run was located. Ship owns the deploy record.
