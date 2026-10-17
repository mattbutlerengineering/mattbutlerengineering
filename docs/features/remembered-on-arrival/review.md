---
stage: review
run: feature:remembered-on-arrival
date: 2026-10-16
reviewed-commit: 0bc8f0c27 (worktree HEAD; contains the #6355 squash f3725682c). origin/main has since moved to eb390a6fe (#6950), which touches none of this run's files.
assumptions:
  - "Scope is the #6355 squash (f3725682c) plus every later commit on 0bc8f0c27 that touched one of its 31 apps/hospitality/src files (brief § Resume 2026-10-16): 0819e5e4d (#6739), ca1c38606 (#6735), 304b3518a (#6728), a1e3aa532 (#6721), 2ee6130ac (#6706), 19b39178d (#6686), 5e9fd4333 (#6541), 493612f36 (#6416), 9893af221 (#6417), 5e82f2e20 (#6405). The later commits are reviewed only where they change what this run built. Their own features are not graded here."
  - "The target repo has no docs/standards.json. The plugin's own standards index applies to the plugin, not to this repo. No finding cites a standard."
  - "adr_status.py reports every repo ADR as `unrecognized`, because the repo writes `status: active` in front matter. Per references/adr-compliance.md, `active` reads as live. All 28 were treated as live."
  - "The code is already merged and deployed (brief § Resume). This stage fixes nothing. Each finding's Decision is a deferral to a named carrier. The skill lets minors be deferred freely, and every finding below is minor."
  - "Severity scale: critical means a live production defect that harms a guest or host (wrong data, a false promise, an injection, a crash). Major means a broken contract the PRD or architecture names, with a visible wrong behaviour. Minor means a decayed guard, an unenforced check, or a cosmetic or language inconsistency that leaves the meaning intact."
---

# Review: Remembered on arrival

## Scope

- **#6355 as merged** (`git show f3725682c`): 44 files. The source files are `constants/confirmation-copy.ts`, `utils/reservation-display.ts` (`specialRequestsText`), `components/booking-widget/ConfirmationView.tsx` (+ css), `GuestDetailsForm.tsx`, `pages/ManageReservationPage.tsx` (+ css), `components/timeline/SpecialRequestsTicket.tsx` (+ css, new), `ReservationDetails.tsx`, `ReservationSheet.tsx`, `sheet-size.ts` (new), `TimelineGrid.tsx`, `pages/TimelinePage.tsx` and `pages/BriefingPage.tsx` (+ css). The rest are tests, two E2E specs, llms pairs and run docs.
- **Later commits on the same files.** Found with `git log f3725682c..HEAD -- <the 31 src files>`. Ten commits, listed in `assumptions`. Two of them changed this run's design: #6735 (`ca1c38606`) moved guest copy into the i18n catalog, and #6739 (`0819e5e4d`) moved the Briefing label onto the catalog.
- **Current state read in full:** `confirmation-copy.ts:1-15`, `confirmation-copy.test.ts:1-76`, `confirmation-copy.source.test.ts:1-63`, `SpecialRequestsTicket.tsx:1-35`, `sheet-size.ts:1-27`, `reservation-display.ts:32-42`, the four `catalogs/*.json` `bookingWidget` blocks, `i18n/runtime.tsx`, `i18n/locales.ts`, the `no-literal-ui-strings` rule (`packages/config/eslint/local-rules.js:127-195`), and the Special Requests blocks in `ConfirmationView.tsx:50-53,160-209`, `ManageReservationPage.tsx:82-88,170-245`, `BriefingPage.tsx:124-207` and `TimelinePage.tsx:165-245,448-451`.
- `verification.md` (2026-10-16) is the predecessor: 11 pass, SC4 fails as written, SC11 passes with a recorded gap. It is not re-run here.

## Findings

### Minor: SC4's "written once" contract and its guard decayed after merge

- Scenario: PRD SC4 says the acknowledgement is a literal in exactly one non-test source file. Since #6735 it is a literal in two: `constants/confirmation-copy.ts:9` and `i18n/catalogs/en-US.json:1199`. `confirmation-copy.test.ts:22-24` pins the two copies equal, so en-US guest and host wording cannot drift silently, and nothing visible is wrong today. Three things decayed around that test:
  1. The committed guard filters to `/\.(ts|tsx)$/` (`confirmation-copy.source.test.ts:24`). A retype of the sentence into any `.json` under `src/` passes it. For example, a new en-US key that copies the acknowledgement for another surface would be missed. The guard has become blind to the file type the guest copy now lives in.
  2. The guard's doc comment (`confirmation-copy.source.test.ts:7-10`) still says "Every surface must read `CONFIRMATION_COPY`". On main, the guest surfaces and the Briefing read the catalog (`ConfirmationView.tsx:169,173`, `ManageReservationPage.tsx:232,236`, `BriefingPage.tsx:198`, `GuestDetailsForm.tsx:212`). Only `SpecialRequestsTicket.tsx:25,28` reads the constant.
  3. `architecture.md` frontmatter (copy-source decision, and the `GuestDetailsForm` label decision) still names `CONFIRMATION_COPY` as the source for all five surfaces and the form label. #6735 changed that contract and recorded no amendment here.
- Standard: none
- Decision: deferred. The code is merged, and the equality pin keeps the user-visible intent. **Human choice needed.** Verify raised it and no default resolves it. The options:
  - (a) Amend SC4: the en-US catalog is the source, and `CONFIRMATION_COPY` must equal it. Widen the guard to scan `.json` and allow-list `en-US.json`.
  - (b) **Recommended.** Make `en-US.json` the only literal. Retire `CONFIRMATION_COPY`'s strings in favour of catalog keys, including a host-caption key that nests the acknowledgement, e.g. `"hostCaption": "Guests see this with: “$t(bookingWidget.specialRequests.acknowledgement)”"`. This makes SC4's literal check true again and fixes the next finding in the same change.
  - Either option also brings the guard comment and `architecture.md` up to date.

### Minor: The host ticket shows English to non-English staff, and its caption quotes the en-US sentence whatever the guest saw

- Scenario:
  - **Staff side.** A host with the dashboard in es-MX opens a reservation with Special Requests on the Timeline (sidebar, phone drawer or tablet sheet). `SpecialRequestsTicket.tsx:25,28` renders `CONFIRMATION_COPY.specialRequestsLabel` and `.hostCaption`, plain English strings from `confirmation-copy.ts:12-14`. So the ticket reads "Special Requests" and "Guests see this with: “Noted. It's on your reservation for the team.”" inside an otherwise Spanish Timeline. The Briefing card for the same booking shows the translated label "Peticiones especiales" (`BriefingPage.tsx:198`, `es-MX.json` `bookingWidget.specialRequests.label`).
  - **Why lint missed it.** `no-literal-ui-strings` only inspects JSX text, JSX string expressions and UI attributes (`local-rules.js:174-193`). Strings imported from a constants module pass it. #6728 put `components/timeline/**` under the rule (`304b3518a` message), and this component slipped through. The localization PRD's own criterion ("every hospitality guest and staff screen shows no untranslated en-US UI text", `docs/features/localization/prd.md:63`) is therefore unmet on this surface.
  - **Guest side.** Guest locale comes from the guest's browser (`runtime.tsx` `bootTarget` → `resolveLocale`). A guest whose browser prefers Spanish saw "Anotado. Ya está en tu reserva para el equipo." The host caption tells staff the guest saw the English sentence.
- **Answer to verification's question 2.** Does "same words" (SC3/SC4 intent) still hold?
  - **In meaning, yes.** The es-MX and fr-CA acknowledgements are faithful, and no stronger than the English (see the next finding). The guest's own text is shown byte-for-byte on both sides. The host is never misled about what was promised.
  - **In literal words, only for en-US and en-GB guests.** en-GB has no `bookingWidget` block, so it falls back to en-US through `fallbackLng: DEFAULT_LOCALE` (`runtime.tsx`).
  - The PRD's caption assumption already says the caption "describes what the guest pages show, not what this guest saw". Read that way it is still accurate for the en-US page. That is why this is minor and not major.
- Standard: none
- Decision: deferred to the localization run (`docs/features/localization`, still before Verify) as an untranslated staff surface. Recommended fix: option (b) of the previous finding, so the label and caption go through `t()` in the dashboard's locale and the caption quotes the acknowledgement in that same locale. Also recommended: a follow-up seed to make `no-literal-ui-strings` (or a test) catch user-visible strings imported from `constants/*` modules. The same blind spot can hide other untranslated copy constants, e.g. `constants/session-lapse-copy.ts`, the precedent `architecture.md` cites. Not audited here.

### Minor: SC8's honesty limits are enforced for en-US only

- Scenario: `confirmation-copy.test.ts:55-76` checks the en-US acknowledgement, host caption and contact line against the banned lists. Nothing checks the es-MX or fr-CA strings that #6735 added. A future machine-translation refresh could bring back an overclaim (e.g. "garantizado", "confirmé", "la cocina") or a false send ("te hemos enviado") and every gate would stay green. en-GB inherits en-US and is covered implicitly.
- Evidence it is clean today: a case-insensitive scan of the es-MX and fr-CA acknowledgements for `garant, confirm, reservad, réservé, arregl, organis, cocina, cuisine, chef, se encarg, pris en charge, s'occup` returned no hits. Both contact lines state the negative ("No se envía ningún correo ni mensaje de confirmación…", "Aucun courriel ni texto de confirmation n'est envoyé…"). They name the venue as holding the contact and promise nothing.
- Standard: none
- Decision: deferred. No live defect. Seed a per-locale honesty test with a word list for each locale. It belongs with the localization run, which owns the translated strings.

### Minor: The manage page's error states still tell guests to use a confirmation email the confirmation page now says doesn't exist

- Scenario: a widget guest is told on the confirmation "No confirmation email or text is sent for this booking…" (`en-US.json:1193`). If they later open an expired or tokenless manage link, they get "Please check the link in your confirmation email." (`manageReservation.noLinkDescription`, `en-US.json:1260`, rendered at `ManageReservationPage.tsx:134`) and "Contact the venue directly using the details in your confirmation email." (`manageReservation.supportLine`, `en-US.json:1257`, `ManageReservationPage.tsx:66`). Before #6355 both pages claimed an email existed. Now the two guest surfaces contradict each other. The run's own honest line made the contradiction visible, but the false copy predates the run.
- Standard: none
- Decision: deferred. The PRD put this out of scope on purpose, as an Open question owned by Matt (`prd.md` Out of scope and Open questions). The backlog seed at `docs/backlog.md:265` ("Send a confirmation email on the booking widget's path, or stop the product implying one exists") already covers it. Restated here so Ship and Operate carry it.

## Passes with no findings

- **Correctness: clean** for the feature's own logic.
  - `specialRequestsText` (`reservation-display.ts:39-42`) is the single presence and display rule for all five surfaces and for `reservationSheetSize`. Presence and display cannot diverge.
  - Every `useId` call in `ManageReservationPage` sits before its early returns (`:88` vs `:131/:140/:154`).
  - The tablet sheet's More state is keyed by reservation id and reset in `clearSelection` (`TimelinePage.tsx:167,206-208,240-243`). That matches the pre-#6355 behaviour inside `ReservationSheet` (`f3725682c^:ReservationSheet.tsx:57-58`), so selecting A→B→A without closing reopens A expanded exactly as before. Not a regression.
  - The grid inset and the Drawer size both come from `reservationSheetSize(notes, expanded)` (`ReservationSheet.tsx:87`, `TimelinePage.tsx:448-451`), so they cannot disagree. `sheet-size.test.ts` pins the mirrored rialto formulas.
  - The later commits #6706, #6416, #6417, #6686, #6541 and #6405 touched these files only in adjacent code (clock, seating, write path, retry state). None changed the Special Requests path. The one red E2E Verify saw (`briefing.spec.ts:101`, timezone-dependent) is #6706's and is not routed here.
- **Design:** the deviations from `architecture.md` are covered by the SC4 finding above. No decision in the diff or the later commits passes all three legs of the ADR test. Moving copy into an i18n catalog is reversible behind `t()`. Keyed More state is local component state.
- **Security: clean.**
  - Guest text renders as a single React text child on every surface (`ConfirmationView.tsx:176`, `ManageReservationPage.tsx:239`, `SpecialRequestsTicket.tsx:31`, `BriefingPage.tsx:201`).
  - `git grep dangerouslySetInnerHTML -- apps/hospitality/src` returns nothing.
  - `interpolation: { escapeValue: false }` (`runtime.tsx`) is safe here. The interpolated `{{contact}}` comes back from `t()` as a string and React renders it as text, never as HTML.
  - No secrets, no new endpoints, no new inputs. `dir="auto"` stops bidi text in the guest's words from reordering the surrounding UI.
- **Complexity (lean cut-list): nothing to cut.** `SHEET_BLOCK_SIZE` and `reservationSheetSize` have 6 non-test references across the sheet, page and grid. `SpecialRequestsTicket` has two callers (`ReservationDetails.tsx:166`, `ReservationSheet.tsx:145`). `special-requests-fixtures.ts` has five test importers. The diff adds no `lean:` markers. The module shape (copy split between a constant and the catalog) is not a size problem. It is handed to the SC4 finding, not to `deepen`.
- **ADR compliance: no violations.**
  - Checked against ADR-001 (Rialto + CSS Modules, no Tailwind). Every new block uses rialto `Text`/`Stack`/`Card`, and the new CSS-module rules use `--rialto-*` tokens or keyword values (`SpecialRequestsTicket.module.css:2-10`, `ConfirmationView.module.css:160-163`, `ManageReservationPage.module.css:59-62`, `BriefingPage.module.css:50-53`). The inline `style={{ … padding: "2rem" }}` in `ManageReservationPage.tsx` predates this run.
  - Checked against ADR-028 (rialto localization through context). The run adds no rialto source, and the app-side catalog use belongs to #6735.
  - Out of scope: ADR-002 to ADR-027, which cover API errors, auth, edge routing, agents, health, versioning, memory, catalog, deploy, monorepo tooling, merge gating, jobs, authorization, AUTH_AUTHORITY, vibe adapters, batching, date vocabulary, motion and RLS. The diff reaches none of these subjects.
- **Domain passes: none selected.** None of the changed paths matches the payments, migrations or dependencies patterns. No `package.json`, lockfile, `*.sql`, `schema.prisma` or payment word appears in `git show --name-only f3725682c` or in the later commits' changes to these files. The `Deposit` card in `ConfirmationView.tsx` is unchanged context, not a changed payment path.

## Verdict

**Ready to ship. It has in fact already shipped (PR #6355, deployed by Deploy Static Sites run 38190128781).** No critical or major findings, and no live production defect. Four minors, all deferred to named carriers:

1. SC4 guard and contract decay. Needs Matt's (a)/(b) choice; (b) is recommended.
2. The untranslated host ticket and its en-US-only caption. Goes to the localization run; same fix as (b).
3. No honesty-limit test for translated copy. Seed with the localization run.
4. Manage-page error copy that cites a confirmation email. Already seeded at `docs/backlog.md:265`; owner Matt.

Ship records the release. It does not block on any of these.
