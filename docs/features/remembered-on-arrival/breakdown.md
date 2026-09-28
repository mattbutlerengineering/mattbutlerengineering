---
stage: decompose
run: feature:remembered-on-arrival
date: 2026-09-28
design-gaps: 0
assumptions:
  - "Tracker labels: every mirrored child issue carries `blocked` (plus `feature` and `area:hospitality`), not `ready`. `ready` is the claim signal for `/implement-queue` and `/issue-worker` (`gh issue list --label ready`), and `.github/workflows/scheduled-issue-completion.yml`'s `promote` pass applies `ready` to any open issue lacking `ready`/`in-progress`/`has-pr`/`needs-review`/`blocked` (its jq filter, lines 139-144 on `origin/main` `7ac892126`). A `ready` label would invite a scheduled worker to build these items concurrently with this run's own Implement stage and open duplicate PRs. This follows the precedent run `maintenance:api-client-route-contract` (#5684–#5695, all `blocked`). The brief's § Tracker says `ready`; that wording is orchestrator elaboration, and the user's answer was `export issues (precedent)`. Reversible with `gh issue edit <N> --remove-label blocked`."
  - "The tracking issue carries `blocked` in addition to the required `tracking` + `feature`. Reason: the same `promote` filter does not exclude `tracking`, so without `blocked` the parent would be the one promotable issue in this set. `tracking` keeps it visible to `tracking-checkbox.yml` (`scripts/tick-tracking-checkbox.mjs`), which ticks `- [ ] #N` lines as children close."
  - "`feature` is kept on the children, where the precedent removed it by hand. The precedent was a maintenance run, where `feature` was the wrong word. This is a feature run, and CLAUDE.md defines `feature` as 'New feature (created by `/decompose`)'. No workflow or skill claims an issue by `feature` without `ready`."
  - "Item count is 15 in five milestones, above the brief's 'Scope to one implement-queue-sized batch (3–10 agent-sized items)' (§ Constraints, orchestrator elaboration, not superseded by the Decision sections). The dispatch requires an explicit item for each of seven must-carry pieces plus one per surface, and each item has to be one test-first sitting. This run's own Implement stage works the items in order; they are not a queue batch. To keep the count down, the form label joins M1.1, the ticket joins its first consumer (M3.1), and the guest and host E2E share one item (M4.4)."
  - "SC4's grep becomes a committed vitest test (M1.2), and Verify still runs the architecture's `git grep`. The architecture had it as a Verify command only. The test also matches the apostrophe-free fragment `on your reservation for the team`, because the JSX-apostrophe rule (gotchas.md § Pre-commit, `&apos;`) is exactly how a surface author would retype the sentence while slipping past an exact-literal grep."
  - "More's state is lifted (M4.1, behaviour-preserving) before the sheet sizes itself from the notes (M4.3), so each step has its own RED. Between M4.2 and M4.3, a reservation with notes gets the default-height grid padding while its sheet still opens compact. That is more clearance than the sheet needs, never less; it exists only on the branch and M4.3 closes it."
  - "SC11's local half sits in M5.2: after `pnpm build`, the built bundle must carry the acknowledgement and `contactLine`'s static prefix, and must not carry `A confirmation has been sent to` (architecture § Interfaces, the SC11 grep contract). The production probe stays with Ship."
  - "E2E acceptance runs through the architecture's uncommitted local harness recipe (§ Verify's E2E path; booking-guest-reuse precedent), not the committed `chromium` project, which needs Auth0 secrets. The advisory `Hospitality E2E` CI job is not an acceptance gate."
  - "The post-commit `pack-changed` hook leaves `llms.txt`/`llms-full.txt` dirty after each feature commit. Feature items do not stage them; M5.1 regenerates and stages them by literal path."
  - "Issue bodies avoid the words `auto-label.yml` maps to extra labels (`security`/`cve`/`vulnerab` → `security`; `revert`/`rollback` with `production` → `rollback`; `process improvement`/`loop regression` → `meta-improvement`; `prisma` → `area:database`). No title starts with `[audit]`, `[acmm` or `[ci-fix]`, the prefixes that make it add `ready`. That is why SC10's excluded list is named in prose in M5.2 rather than by path."
  - "Every file:line cited here was read in this worktree at `8067ec122` (base `6d27b5b47`). `origin/main` is at `7ac892126`, three commits later, and none of them touches `apps/hospitality` or rialto's `Drawer`. No open PR touches this run's source files. #5846 (Dependabot group) edits `apps/hospitality/package.json` only; M5.2 re-measures the size budgets if it lands first."
  - "Two citations differ from architecture.md by a line: the `TimelinePage.test.tsx` barrel mock is at `:56` (architecture `:55`), and `ReservationSheet.tsx`'s `expandedFor` state is at `:57-58` (architecture `:56-58`). The lines cited here are the ones read in the worktree."
---

# Breakdown: Remembered on arrival

Progress lives in the checkboxes below. Implement checks items off as their
acceptance criteria are met.

Primary input: `architecture.md` (`8067ec122`). Requirements: `prd.md` SC1–SC12
and US1–US5. Copy: `ux.md` § Copy; every string an AC quotes is character for
character from there. This file sequences the architecture and does not
re-decide any of it.

Item IDs (`M1.3` and so on) are for cross-reference in `Blocked by:` and the SC
map. They are not tracker ids.

**Tracker mirror: on** (ADR-0026, one-way out). Tracking issue:
#5875. Each item's issue is on its checkbox line. The checkboxes here
are the state and the issues are the mirror; each issue closes at its item's
boundary. No existing issue matched any item, so nothing was imported.

Paths are under `apps/hospitality/src/` unless prefixed. Tests run in vitest
from inside `apps/hospitality` (`pnpm test`; gotchas.md § Build). Surface
tests import `CONFIRMATION_COPY` and `contactLine` and never retype the
strings (SC4). Fixtures are the architecture's § Test strategy fixtures:

- **Two-line note:** `"  Our anniversary.\nWindow seat if you can, and she can't have tree nuts.  \n"`. Displayed text: the same with the ends trimmed.
- **Untrusted note:** `<script>alert(1)</script>\n<a href="https://x">x</a> &amp; "double" 'single'`.
- **Empties:** `null`, `""`, `"   "`, `"\n\t "`, run as an `it.each`.

## Milestone 1: One copy source, one presence rule, and test mocks that can see a group

**Demonstrable:** the four strings exist once and are pinned. A guard test goes
red if anyone retypes the acknowledgement. `specialRequestsText` answers "is
there a request, and what shows" for every input. Both mocked test files can
resolve `getByRole("group", { name })`. There is no UI change yet, except that
the form label now reads the constant; its text is unchanged.

- [x] **M1.1 `confirmation-copy.ts` pins the four strings, and the form label reads it** — new `constants/confirmation-copy.ts` (+ test), and `GuestDetailsForm.tsx:213` switches to the constant (tracker: #5860)
  - Build: `CONFIRMATION_COPY = Object.freeze({ specialRequestsLabel, acknowledgement, hostCaption })` and `contactLine(contact: string): string`, shaped like `constants/session-lapse-copy.ts`. The module imports nothing. `hostCaption` is composed as `` `Guests see this with: “${acknowledgement}”` ``, so the acknowledgement literal is written once. `GuestDetailsForm.tsx:213` becomes `label={CONFIRMATION_COPY.specialRequestsLabel}`. The hint at `:210` is untouched.
  - Accept: new `constants/confirmation-copy.test.ts` fails first (`Failed to resolve import "./confirmation-copy.js"`), then passes:
    - `specialRequestsLabel === "Special Requests"`;
    - `acknowledgement === "Noted. It's on your reservation for the team."`, with a straight U+0027;
    - `hostCaption === "Guests see this with: “Noted. It's on your reservation for the team.”"`, written with the `“`/`”` escapes so that straight quotes cannot pass;
    - `contactLine("sam@example.com") === "No confirmation email or text is sent for this booking, so save these details. The venue has sam@example.com on your reservation."`;
    - `Object.isFrozen(CONFIRMATION_COPY)`.
  - Accept (SC8), case-insensitive:
    - none of `guarantee`, `confirm`, `reserved`, `arranged`, `kitchen`, `chef`, `will `, `taken care` appears in `acknowledgement` or `hostCaption`;
    - none of `has been sent`, `we've sent`, `check your`, `will receive` appears in `contactLine("x@y.z")`.
  - Accept (form): `GuestDetailsForm.test.tsx` resolves the textarea with `getByLabelText(CONFIRMATION_COPY.specialRequestsLabel)`, and its existing tests (e.g. `:225-226`) pass unchanged.
  - Accept (gates): `pnpm typecheck` is green.
  - Serves: SC4, SC8 (US1–US4 wording)
  - Blocked by: —
- [x] **M1.2 SC4 single-literal guard test** — a committed test that fails if the acknowledgement sentence appears in any non-test source file other than `constants/confirmation-copy.ts` (tracker: #5861)
  - Build: a describe in `confirmation-copy.test.ts` (or a sibling `confirmation-copy.source.test.ts`). It walks `resolve(process.cwd(), "src")`, the cwd convention of `components/floor-plan/TableShape.test.tsx:19-22`, skips files whose name contains `.test.`, and reads every `.ts`/`.tsx` file.
  - Accept:
    - The files containing `Noted. It's on your reservation for the team.` are exactly `["constants/confirmation-copy.ts"]`, with exactly one occurrence there. This proves that `hostCaption` composes the sentence rather than retyping it.
    - The files containing the apostrophe-free fragment `on your reservation for the team` are the same single file, which catches a JSX `&apos;` retype.
  - Accept (the guard is live): a scratch non-test file carrying the literal makes the test fail with a message naming that file. The scratch file is then removed and never committed, and the failing output goes in § Notes.
  - Accept (cross-check): `git grep -l "Noted. It's on your reservation for the team." -- apps/hospitality/src ':!*.test.*'` prints exactly `apps/hospitality/src/constants/confirmation-copy.ts`.
  - Serves: SC4
  - Blocked by: M1.1
- [x] **M1.3 `specialRequestsText` — the one presence rule** — `utils/reservation-display.ts` gains `specialRequestsText(notes: string | null | undefined): string | null` (tracker: #5862)
  - Build: returns `null` for `null`, `undefined`, and any string empty after `String.prototype.trim()`; otherwise returns `notes.trim()`, with interior spaces and `\n` kept. There is no separate `hasSpecialRequests`. It sits beside `STATUS_LABEL` and `formatReservationTime`.
  - Accept: `utils/reservation-display.test.ts` gains tests that fail first (the export is absent), then pass:
    - `it.each([null, undefined, "", "   ", "\n\t "])` returns `null`;
    - the two-line note returns `"Our anniversary.\nWindow seat if you can, and she can't have tree nuts."`;
    - `"a  b"` returns `"a  b"`;
    - the untrusted note is returned character for character.
  - Accept: the module's existing exports and tests are unchanged and green.
  - Serves: SC5 (the displayed-text rule behind SC1–SC3)
  - Blocked by: —
- [ ] **M1.4 Widen the two rialto test mocks** — `ConfirmationView.test.tsx` (`:8-23`) and `BriefingPage.test.tsx` (`:55-148`) stubs forward their remaining props and honour `as`, so group names resolve (tracker: #5863)
  - Build:
    - In `ConfirmationView.test.tsx`, the `Text` stub renders the element named by `as` (default `span`) and forwards `id`, `dir`, `className`, `role` and `aria-*`. A `Stack` stub is added: a `div` that forwards the same props. `Button` is unchanged.
    - In `BriefingPage.test.tsx`, `Stack` (`:134`) forwards `role` and `aria-*`, and `Text` (`:140-148`) honours `as` and forwards `id`, `dir`, `role` and `aria-*` alongside `className`.
    - Neither file switches to real rialto.
  - Accept:
    - In each file, a new probe test fails first against today's stubs, then passes. It renders the mocked primitives directly: `<Stack role="group" aria-labelledby="t"><Text id="t" as="h3">Probe</Text></Stack>`. It asserts `getByRole("group", { name: "Probe" })` and `getByRole("heading", { level: 3, name: "Probe" })`.
    - Every existing test in both files passes unchanged.
  - Serves: SC1, SC3, SC9 (test infrastructure the group assertions depend on)
  - Blocked by: —

## Milestone 2: The guest pages say the request back, and the confirmation stops claiming a send

**Demonstrable:** with notes present, `ConfirmationView` and
`ManageReservationPage` render a `Special Requests` group with the
acknowledgement and the guest's words as one text node. With empty notes they
render nothing new. The confirmation's contact line no longer claims a message
was sent.

- [ ] **M2.1 `ConfirmationView` Special Requests card** — a `detailsCard` group right after Reservation Details and before the deposit card, with the label as its `h3`, the acknowledgement, and the words (tracker: #5864)
  - Build:
    - `useId()` at the top of `ConfirmationView`.
    - When `specialRequestsText(reservation.notes)` is non-null, render a `div className={styles.detailsCard} role="group" aria-labelledby={id}` directly after the details card (opens `:96`) and before the deposit card. It holds `Text id={id} variant="label" as="h3" color="secondary" className={styles.detailsTitle}` with `{CONFIRMATION_COPY.specialRequestsLabel}`, then a `Stack gap="sm"` with the acknowledgement (`Text variant="caption" color="secondary"`) and the words (`Text variant="caption" color="primary" dir="auto" className={styles.requestsText}`).
    - `ConfirmationView.module.css` gains `.requestsText { white-space: pre-wrap; overflow-wrap: anywhere; }`. `useId` and `Stack` are new imports.
  - Accept (SC1): new tests in `ConfirmationView.test.tsx` fail first, then pass. With the two-line note:
    - `getByRole("group", { name: CONFIRMATION_COPY.specialRequestsLabel })` contains `getByRole("heading", { level: 3, name: CONFIRMATION_COPY.specialRequestsLabel })` and the acknowledgement text;
    - the words element has `childNodes.length === 1`, the child is a `Node.TEXT_NODE` whose value equals the displayed text (`\n` included), and the element has `dir="auto"`;
    - the group follows the Reservation Details card in document order, and precedes the Deposit card when one renders.
  - Accept (SC5): for each of the four empties, there is no group, no label text and no acknowledgement. The `detailsCard` element count is identical across the four empties and one less than with present notes.
  - Accept (SC6): with the untrusted note, the group's text holds the literal characters, `group.querySelector("script, a")` is `null`, and the words are one text node.
  - Accept (SC9):
    - Neither the group nor any ancestor carries `aria-live`, and there is none inside it.
    - A CSS-text test reading `ConfirmationView.module.css` pins `white-space: pre-wrap` and `overflow-wrap: anywhere` on `.requestsText`.
    - The changed CSS lines use only `var(--rialto-*)` or keyword values.
  - Accept: the file's existing tests pass.
  - Serves: SC1, SC5, SC6, SC9 (US1)
  - Blocked by: M1.1, M1.3, M1.4
- [ ] **M2.2 The honest contact line** — `ConfirmationView.tsx:183-187` renders `contactLine(...)`, and the pinned tests at `ConfirmationView.test.tsx:169` and `:190` are replaced, not deleted (tracker: #5865)
  - Build: the line keeps its slot, its condition (`guestEmail || guestPhone`) and its `Text variant="caption" color="secondary" align="center"`. Its text becomes `{contactLine(reservation.guestEmail || reservation.guestPhone)}`, and it gains `className={styles.contactLine}` (`.contactLine { overflow-wrap: anywhere; }`).
  - Accept: tests are rewritten in place; each new assertion fails first against today's line:
    - `:169` (email case) becomes `getByText(contactLine("john@example.com"))`;
    - the phone-only test asserts `getByText(contactLine("+15551234"))`;
    - a new both-present test asserts the email variant;
    - `:190` becomes "no contact line when there is neither an email nor a phone" and asserts `queryByText(/^No confirmation email or text is sent/)` is `null`;
    - every one of these asserts `queryByText(/A confirmation has been sent/)` is `null`.
  - Accept: a CSS-text test pins `overflow-wrap: anywhere` on `.contactLine`. `git grep -n "A confirmation has been sent" -- apps/hospitality/src` prints nothing.
  - Serves: SC7 (US2), SC8 through the pinned copy
  - Blocked by: M1.1, M1.4
- [ ] **M2.3 `ManageReservationPage` Special Requests card** — delete the bare row at `ManageReservationPage.tsx:195-202`, and add a `Card` group after the details card and before Add to Calendar (tracker: #5866)
  - Build:
    - The `Card role="group" aria-labelledby={id}` holds an inner `Stack gap="md" className={styles.cardInset}` (`.cardInset { padding: var(--rialto-space-lg); }`, never the page's inline `"1.5rem"`). Inside it: `Text as="h2" id={id} variant="label" color="secondary"` with the label, then a `Stack gap="sm"` with the acknowledgement (`Text variant="body" color="secondary"`) and the words (`Text variant="body" dir="auto" className={styles.requestsText}`, which is pre-wrap and anywhere).
    - `useId()` joins the page's other hooks above the missing-token, loading and error early returns.
    - The card renders for every status, CANCELLED included.
  - Accept (SC2): new tests in `ManageReservationPage.test.tsx` fail first, then pass. They go through the real api client and `mockFetch`, as the file already does at `:143-156`. With the two-line note:
    - the group is named by the label and holds an `h2` with it;
    - the acknowledgement is present, and the words are one text node equal to the displayed text, with `dir="auto"`;
    - the Reservation Details card no longer contains `Special Requests`, and `getAllByRole("group", { name: CONFIRMATION_COPY.specialRequestsLabel })` has length 1;
    - a CANCELLED reservation with notes still shows the group.
  - Accept (SC5): for each of the four empties, there is no group, label or acknowledgement. The `Card` count is identical across the empties and one less than with present notes.
  - Accept (SC6): the untrusted note shows literal characters, and there is no `script` or `a` in the group.
  - Accept (SC9): there is no `aria-live` in or around the group. A CSS-text test pins `.requestsText` wrapping and the `var(--rialto-space-lg)` inset.
  - Accept: the existing test "shows reservation details for valid token" (notes `"Window seat please"`) stays green.
  - Serves: SC2, SC5, SC6, SC9 (US3)
  - Blocked by: M1.1, M1.3

## Milestone 3: The host ticket on the desktop sidebar, the phone drawer and the Briefing

**Demonstrable:** selecting a reservation with notes on desktop (sidebar) or
phone (right drawer) shows `Special Requests`, the host caption, and the words
in the recessed box. `Notes` is gone. The Briefing card labels the guest's words
apart from the unlabelled, italic staff note.

- [ ] **M3.1 `SpecialRequestsTicket`, rendered by `ReservationDetails`** — new `components/timeline/SpecialRequestsTicket.tsx` (+ `.module.css`, `.test.tsx`) replaces the Notes block at `ReservationDetails.tsx:167-176` (tracker: #5867)
  - Build:
    - Props `{ notes }`. `useId()` is called first; the component returns `null` when `specialRequestsText(notes)` is `null`.
    - Otherwise it renders a `Stack gap="2xs" role="group" aria-labelledby={id}` holding the label (`Text id={id} variant="label" color="secondary"`), the caption (`Text variant="caption" color="secondary" as="div"` with `CONFIRMATION_COPY.hostCaption`) and the words (`Text variant="body" as="div" dir="auto" className={styles.notesValue}`).
    - `.notesValue` moves unchanged from `ReservationDetails.module.css:9-15`, plus `white-space: pre-wrap; overflow-wrap: anywhere;`.
    - `ReservationDetails` renders `<SpecialRequestsTicket notes={reservation.notes} />` in the same slot, after Status and before `StaffDepositSection`. The orphaned `.notesValue` rule leaves `ReservationDetails.module.css`.
  - Accept: new `SpecialRequestsTicket.test.tsx` fails first (module absent), then passes. With the two-line note:
    - the group is named `CONFIRMATION_COPY.specialRequestsLabel` and contains `CONFIRMATION_COPY.hostCaption`;
    - the words element's only child is a text node equal to the displayed text, and it has `dir="auto"`;
    - `group.querySelectorAll("a, button, input, select, textarea, [tabindex]")` is empty, and there is no `aria-live`;
    - the untrusted note shows literal characters, and `group.querySelector("script, a")` is `null`;
    - each of the four empties gives `container.firstChild === null`;
    - a CSS-text test pins `pre-wrap` and `anywhere` on `.notesValue`.
  - Accept (`ReservationDetails.test.tsx`): with notes, `getByRole("group", { name: CONFIRMATION_COPY.specialRequestsLabel })` is present and `queryByText("Notes")` is `null`. With each empty, there is no group and no label. `git grep -n notesValue -- apps/hospitality/src` lists only the ticket's files.
  - Serves: SC3 (sidebar and phone drawer; the host surface SC6 names), SC5, SC6, SC9 (US4)
  - Blocked by: M1.1, M1.3
- [ ] **M3.2 Briefing card labels the guest's words** — `BriefingCard` replaces the unlabelled line at `BriefingPage.tsx:174-178` with a `Special Requests` group, and the staff note (`:180-184`) is untouched (tracker: #5868)
  - Build:
    - `useId()` at the top of `BriefingCard`, never inside the conditional.
    - A `Stack gap="2xs" role="group" aria-labelledby={id}` holding the label (`Text id={id} variant="label" color="secondary"`) and the words (`Text variant="caption" color="primary" dir="auto" className={styles.requests}`). There is no caption on this surface.
    - `BriefingPage.module.css` gains `.requests` with `white-space: pre-wrap; overflow-wrap: anywhere;` and no `font-style`. `.notes` (`:44-47`, italic) is unchanged.
  - Accept: new tests in `BriefingPage.test.tsx` (widened mock) fail first, then pass:
    - with notes, the group named by the label contains the words as one text node with `dir="auto"`;
    - the staff note's element is not inside the group (`group.contains(staffNote) === false`) and has no label of its own;
    - each of the four empties gives no group and no label;
    - a CSS-text test pins the wrapping on `.requests`, the absence of `italic` there, and `.notes` unchanged.
  - Accept: the existing tests pass, including the fixture at `:172`.
  - Serves: SC3 (the Briefing clause), SC5, SC9 (US5)
  - Blocked by: M1.1, M1.3, M1.4

## Milestone 4: The tablet sheet shows the request without More, and the grid clears the sheet

**Demonstrable:** at 1024×768, a party with notes opens the sheet at the
default height with the `Special Requests` block above Seat Guest, visible
without pressing More. A party without notes opens compact, as today. The
grid's `scroll-padding-block-end` equals the sheet's height in every state,
including after More. The E2E specs prove it in a real browser, along with the
guest pages at 375 px.

- [ ] **M4.1 More's state moves to `TimelinePage`** — `ReservationSheet` becomes controlled (`expanded`, `onToggleExpanded`), behaviour-preserving, with a stateful test harness (tracker: #5869)
  - Build:
    - `ReservationSheetProps` gains `expanded: boolean` and `onToggleExpanded: () => void`. The `expandedFor` state (`ReservationSheet.tsx:57-58`) is removed, and More calls `onToggleExpanded`. `aria-expanded={expanded}` stays, and `aria-controls` still appears only while expanded. The Drawer `size` stays `expanded ? "default" : "compact"` in this item.
    - `TimelinePage.tsx` gains `const [sheetExpandedFor, setSheetExpandedFor] = useState<string | null>(null)` and `sheetExpanded = selectedReservation !== null && sheetExpandedFor === selectedReservation.id`. `clearSelection` (`:211-214`) also resets it. The sheet (`:577`) receives `expanded={sheetExpanded}`, plus an `onToggleExpanded` event handler that flips between `null` and the selected id. Nothing is set from an effect.
  - Accept (`ReservationSheet.test.tsx`): `renderSheet` (`:134`) renders through a small harness that holds `expanded`. The file's ten `moreButton()` interactions and the compact → default → compact test (`:212-225`) pass unchanged.
  - Accept (`TimelinePage.test.tsx`): the `ReservationSheet` stub (`:144-145`) grows a More button wired to `onToggleExpanded` and exposes `expanded` (e.g. `data-expanded`). New tablet tests fail first, then pass:
    - selecting r1 and pressing More makes the stub report expanded;
    - closing and reselecting r1 reports collapsed;
    - selecting r1, pressing More, then selecting r2 reports collapsed (the state is keyed by id).
  - Accept (gates): `pnpm typecheck` and `pnpm lint` are green, with no setState-in-effect.
  - Serves: SC3 (enables the sheet clause), grid clearance (UX-surfaced)
  - Blocked by: —
- [ ] **M4.2 `reservationSheetSize` and the CSS-length `bottomInset`, with the Drawer drift guard** — new `components/timeline/sheet-size.ts`; `TimelineGrid.bottomInset` becomes a CSS length that `TimelinePage` derives from the same inputs as the sheet (tracker: #5870)
  - Build:
    - `sheet-size.ts` exports `type ReservationSheetSize = "compact" | "default"`, `reservationSheetSize(notes, expanded)` (default when `expanded` or `specialRequestsText(notes) !== null`, else compact), and `SHEET_BLOCK_SIZE = Object.freeze({ compact: "min(40vh, 240px)", default: "min(50vh, 480px)" })`.
    - `TimelineGrid.tsx:34` becomes `bottomInset?: string`; `:216` is unchanged.
    - `TimelinePage.tsx` drops `SHEET_INSET_PX` (`:53`). `:424` becomes `viewport === "tablet" && selectedReservation ? SHEET_BLOCK_SIZE[reservationSheetSize(selectedReservation.notes, sheetExpanded)] : undefined`.
    - `sheet-size` is imported by path (`../components/timeline/sheet-size.js`), not through the barrel, which `TimelinePage.test.tsx:56` mocks wholesale.
  - Accept: new `sheet-size.test.ts` fails first (module absent), then passes:
    - the four combinations of present/absent notes × expanded return `"default"` except absent-and-collapsed, which returns `"compact"`;
    - `"   "` collapsed returns `"compact"`.
  - Accept (Drawer drift guard): the test reads `resolve(process.cwd(), "../../packages/rialto/src/components/Drawer/Drawer.module.css")` (precedent `TableShape.test.tsx:19-22`, sanctioned by `apps/hospitality/CLAUDE.md:103`). It asserts that the `.bottom` height (`Drawer.module.css:57`) equals `SHEET_BLOCK_SIZE.default` and the `.compact.bottom` height (`:94`) equals `SHEET_BLOCK_SIZE.compact`. A scratch edit of one mirror value makes it fail; the scratch edit is removed and the output goes in § Notes.
  - Accept (`TimelineGrid.test.tsx`): `:759-760` passes `"240px"` and still reads `"240px"`.
  - Accept (`TimelinePage.test.tsx`): the grid stub's `bottomInset?: number` (`:74`) becomes `string`. The cases:
    - tablet, no notes → `SHEET_BLOCK_SIZE.compact` (replaces `toHaveTextContent("240")` at `:1564`);
    - tablet, notes → `SHEET_BLOCK_SIZE.default`;
    - More pressed → `.default`;
    - More, then close, then reselect → `.compact`;
    - desktop → empty (`:1544`, kept).
  - Accept: `git grep -n SHEET_INSET_PX -- apps/hospitality/src` prints nothing.
  - Serves: grid clearance (UX-surfaced; the hospitality-service-ux Screen 4 guarantee), SC5 (a whitespace note stays compact)
  - Blocked by: M1.3, M4.1
- [ ] **M4.3 The sheet shows the request above the actions and sizes itself from it** — `SpecialRequestsTicket` moves out of More, and the run deliberately inverts `ReservationSheet.test.tsx:227-245` (tracker: #5871)
  - Build:
    - `ReservationSheet.tsx` renders `<SpecialRequestsTicket notes={reservation.notes} />` between the signals row and the failure banner (`:137`).
    - The expanded section's notes block (`:207-216`) is removed.
    - The Drawer gets `size={reservationSheetSize(reservation.notes, expanded)}` (`:79`).
    - The doc comment's "and notes" clause (`:39-42`) is corrected. Its "phone's bottom sheet" wording is stale too, but it is a surfaced item outside this run and stays.
  - Accept: `:227-245` ("reveals the GuestCard, email, phone and notes only once expanded") is inverted on purpose, and each new assertion fails first:
    - Its notes half becomes "Special Requests is visible before More": `getByRole("group", { name: CONFIRMATION_COPY.specialRequestsLabel })` and the text `Window seat` are present before More is pressed, and still present after.
    - Its GuestCard, email and phone half stands unchanged: absent before More, present after.
  - Accept (new tests):
    - A sheet with notes opens with `drawerSize(dialog) === "default"`. Pressing More flips `aria-expanded` from `"false"` to `"true"` and reveals the GuestCard, email and phone, while `drawerSize` stays `"default"` and the group stays.
    - With `notes: "   "`, the size is `"compact"` and there is no group.
    - The group precedes the `Seat Guest` button in document order.
    - `:212-225` (no notes) is unchanged and green.
  - Serves: SC3 (sheet clause: visible without More), SC5 (US5)
  - Blocked by: M3.1, M4.1, M4.2
- [ ] **M4.4 E2E — `special-requests.spec.ts` and the `timeline-interaction.spec.ts` clearance checks** — the real-browser proof of SC1's line break, SC9 at 375 px, SC3 on the sidebar and sheet, and grid clearance (tracker: #5872)
  - Build, guest describe (new `apps/hospitality/e2e/special-requests.spec.ts`, 375×812):
    - Spec-local route overrides are registered after `mockApi`, following `booking-widget-calendar.spec.ts`; `api-mocks.ts` is unchanged.
    - The public confirm returns a reservation whose notes is a 2,000-character string containing a 300-character unbroken run and a `\n`. The hold gets a future expiry, the recognise lookup is stubbed, and `**/public/v1/reservations/manage*` answers with the same notes.
    - A second, short case uses the two-line note.
  - Accept (guest): on `ConfirmationView`, driven through the widget flow, and on `ManageReservationPage`:
    - the `Special Requests` group is visible, and `document.documentElement.scrollWidth <= window.innerWidth` (SC9);
    - with the two-line note, `Range.getClientRects()` over the words' text node gives at least two distinct tops, and the range after the `\n` begins on a lower line box than the range before it, so the break is the guest's and not wrapping (SC1).
  - Accept (host describe, same file): Bob Smith (`res_e2e_002`, notes `Birthday celebration`).
    - At 1280×720, selecting his block shows the sidebar group with the host caption and the words.
    - At 1024×768, the sheet's group is `toBeInViewport()` without pressing More (SC3).
  - Accept (`timeline-interaction.spec.ts`): two tests beside `:216-247`.
    - Bob at 1024×768: `parseFloat(getComputedStyle(grid).scrollPaddingBlockEnd)` is within 1 px of the sheet's bounding-box height.
    - Carol (`res_e2e_003`, no notes) after pressing More: the same check.
    - `:226` (`toHaveCSS("scroll-padding-block-end", "240px")`) is kept. If Chromium serialises `min(40vh, 240px)` differently, that line is replaced by the same within-1-px comparison. § Notes records which happened.
    - The guard is live: the Bob test is run once with `bottomInset` forced to `SHEET_BLOCK_SIZE.compact` (a scratch edit, not committed) and fails.
  - Accept (runs): all of it runs through the architecture's local harness recipe (§ Verify's E2E path); nothing from the harness is committed.
    - `special-requests.spec.ts` and `timeline-interaction.spec.ts` pass.
    - Across `booking-widget*.spec.ts`, `timeline*.spec.ts`, `briefing.spec.ts`, `walkin.spec.ts` and `realtime-collaboration.spec.ts`, no spec that passes on the base commit fails after the change.
  - Accept (review): `e2e-selector-drift-reviewer` on `git diff origin/main...HEAD -- apps/hospitality/e2e` reports no strict-mode collision or stateful-mock gap. It confirms that no spec asserts the compact tablet sheet after a walk-in: the mock stamps `notes: "Walk-in"` (`e2e/api-mocks.ts:485`), so that sheet now opens tall. `e2e/screenshots/` stays unstaged.
  - Serves: SC1, SC3, SC9, grid clearance
  - Blocked by: M2.1, M2.3, M3.1, M4.2, M4.3

## Milestone 5: Generated context and gates

**Demonstrable:** generated context matches the source, every SC12 gate is
green, and the diff contains nothing SC10 excludes.

- [ ] **M5.1 Regenerate the llms artifacts and commit them by explicit path** — `pnpm build --filter @mbe/cli...`, then `pnpm regen`, staging only the llms pairs it rewrote (tracker: #5873)
  - Build: run from the repo root after the last code commit, with no unrelated source edits in the tree (dirty source poisons the output). Stage by literal path only, from `apps/hospitality/llms.txt`, `apps/hospitality/llms-full.txt`, `llms.txt` and `llms-full.txt`. Never use a glob or `git add -A`.
  - Accept: `pnpm regen --check` exits 0 on the committed tree. `git diff --name-only origin/main...HEAD` lists no generated file outside those four. `generated-artifact-determinism-reviewer` on the diff reports the artifacts in sync and deterministic.
  - Serves: SC12
  - Blocked by: M1.1, M1.2, M1.3, M1.4, M2.1, M2.2, M2.3, M3.1, M3.2, M4.1, M4.2, M4.3, M4.4
- [ ] **M5.2 Final gates and the diff checks** — SC12 gates in `apps/hospitality`, SC10's excluded list, SC6's no-`dangerouslySetInnerHTML` grep, and SC11's local bundle half (tracker: #5874)
  - Accept (gates): from `apps/hospitality`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm size` all exit 0. Outputs and the SHA they ran against go in § Notes. If the Dependabot group #5846 lands on `main` first, re-measure the size budgets rather than assume them (gotchas.md § Dependencies).
  - Accept (SC10): `git diff --name-only origin/main...HEAD` lists none of the files PRD SC10 excludes: the public holds route, the confirm-hold service, any notifier or email file, the database schema, the `packages/types` request/response schemas, and `packages/api-client`. It also lists nothing under the rialto package, so no `.changeset/*.md` is needed and none is added. `pnpm-lock.yaml` and every `package.json` are unchanged.
  - Accept (SC6): `git diff origin/main...HEAD -- apps/hospitality/src | grep dangerouslySetInnerHTML` prints nothing.
  - Accept (SC11, local half): after `pnpm build`, the built JS under `apps/hospitality/dist/assets/` contains `Noted. It's on your reservation for the team.` and `No confirmation email or text is sent for this booking, so save these details. The venue has `, and does not contain `A confirmation has been sent to`. The live-site probe is Ship's.
  - Accept (ADR): `node tools/cli/dist/index.js check-adr` exits 0.
  - Serves: SC6, SC10, SC11 (local half), SC12
  - Blocked by: M5.1

## Success-criteria map

| SC                                   | Delivered by                             | Checked in                                                                                                         |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| SC1 ConfirmationView echo            | M2.1 (M1.1, M1.3, M1.4), M4.4            | `ConfirmationView.test.tsx` group/text-node/`dir` tests; CSS-text `pre-wrap`; Playwright line boxes                |
| SC2 ManageReservationPage echo       | M2.3                                     | `ManageReservationPage.test.tsx` via `mockFetch`; row removed; group once                                          |
| SC3 Host ticket, sheet, Briefing     | M3.1, M3.2, M4.3, M4.4                   | `SpecialRequestsTicket` / `ReservationDetails` / `ReservationSheet` / `BriefingPage` tests; host Playwright        |
| SC4 One copy source                  | M1.1, M1.2 (every surface item)          | `confirmation-copy.test.ts` literals; the committed single-literal guard; `git grep` cross-check                   |
| SC5 Empty renders nothing            | M1.3, M2.1, M2.3, M3.1, M3.2, M4.2, M4.3 | `specialRequestsText` table; per-surface `it.each` over the four empties; sheet compact for `"   "`                |
| SC6 Untrusted text stays text        | M2.1, M2.3, M3.1, M5.2                   | untrusted-note tests on three surfaces; `dangerouslySetInnerHTML` diff grep                                        |
| SC7 Honest contact line              | M2.2                                     | `:169` / `:190` replaced; email, phone-only, both, neither                                                         |
| SC8 Honesty limits                   | M1.1                                     | `confirmation-copy.test.ts` banned-word lists                                                                      |
| SC9 Accessible and legible           | M1.4, M2.1, M2.3, M3.1, M3.2, M4.4       | group names, no `aria-live`, CSS keyword/token checks; 375 px `scrollWidth`                                        |
| SC10 No excluded change              | M5.2                                     | `git diff --name-only origin/main...HEAD` against the PRD list (Verify re-runs it)                                 |
| SC11 Production evidence             | M5.2 (local bundle half)                 | built-bundle grep; the live-site probe and its recorded evidence gap belong to Ship / Verify (architecture § SC11) |
| SC12 Gates                           | M5.1, M5.2                               | `pnpm regen --check`; lint / typecheck / test / build / size outputs in § Notes                                    |
| Grid clearance (UX-surfaced)         | M4.1, M4.2, M4.3, M4.4                   | `sheet-size.test.ts` + Drawer drift guard; `TimelinePage.test.tsx` five cases; two Playwright clearance tests      |
| Pinned test `:227-245` (UX-surfaced) | M4.3                                     | inverted on purpose; its GuestCard/email/phone half stands                                                         |

## Architecture component coverage

| Component (architecture.md § Components)                  | Item(s)    |
| --------------------------------------------------------- | ---------- |
| `constants/confirmation-copy.ts`                          | M1.1, M1.2 |
| `utils/reservation-display.ts` → `specialRequestsText`    | M1.3       |
| `components/timeline/sheet-size.ts`                       | M4.2       |
| `components/timeline/SpecialRequestsTicket.tsx` + `.css`  | M3.1       |
| `components/timeline/ReservationDetails.tsx`              | M3.1       |
| `components/timeline/ReservationSheet.tsx`                | M4.1, M4.3 |
| `components/timeline/TimelineGrid.tsx` (prop type)        | M4.2       |
| `pages/TimelinePage.tsx`                                  | M4.1, M4.2 |
| `pages/BriefingPage.tsx` + `.module.css`                  | M3.2       |
| `components/booking-widget/ConfirmationView.tsx` + `.css` | M2.1, M2.2 |
| `components/booking-widget/GuestDetailsForm.tsx`          | M1.1       |
| `pages/ManageReservationPage.tsx` + `.module.css`         | M2.3       |
| `e2e/special-requests.spec.ts` + `timeline-interaction`   | M4.4       |
| Test infrastructure (two rialto mocks, sheet harness)     | M1.4, M4.1 |
| Generated artifacts, gates                                | M5.1, M5.2 |

## Design gaps found

None. Every component, interface and test in `architecture.md` maps to an item,
and no item needed a decision the architecture had not made.

## Notes

- 2026-09-28 (Decompose): Tracker mirror exported. Children
  #5860–#5874 (M1.1 → M5.2, in item order), each labelled `blocked` + `feature` + `area:hospitality`
  (see `assumptions:` for why `blocked` and not `ready`). The tracking issue is
  #5875 (`tracking` + `feature` + `blocked`), with a `- [ ] #N — title`
  list that `tracking-checkbox.yml` ticks as children close. No issue is
  assigned. Each issue was verified with `gh issue view` after creation: all 16
  are open and unassigned, and none carries `ready`. `auto-label.yml` fires on
  `opened` and `edited`. Beyond the labels applied at creation, it added
  `area:rialto` on #5870 (from the Drawer path in M4.2) and `area:hospitality`
  on #5875. Nothing queries
  `area:*` labels. Do not edit these issue bodies, or `auto-label` re-runs.
  Issue bodies were generated from this file's item text, so each one quotes
  its item's build notes and acceptance criteria verbatim. Each body's
  `Blocked by` names the blocker's issue number.
- 2026-09-28 (Decompose): In-flight check. `gh pr list --state open` showed
  #5824, #5845, #5846, #5848, #5856, #5857, #5859. None edits a file this
  breakdown names; #5846 edits `apps/hospitality/package.json` (dependency bump),
  hence the size re-measure clause in M5.2. The PRD's brief correction (#5781
  merged as `3823faa80`) stands.
- 2026-09-28 (Decompose): Implement order is the milestone order. M4.1 has no
  blockers and may run earlier. Everything in M2 and M3 depends only on M1.
- 2026-09-28 (Implement, M1.1): RED was `Failed to resolve import "./confirmation-copy.js"`; GREEN 17/17. The form clause needed one test-infra change the item did not name: `GuestDetailsForm.test.tsx`'s rialto `TextArea` stub rendered `<label>{label}</label>` beside the `<textarea>` with no association, so `getByLabelText("Special Requests")` failed with `Found a label with the text of: Special Requests, however no form control was found associated to that label`. The stub now sets `htmlFor`/`id` (the same slug it already used for `data-testid`), mirroring the real `TextArea`, which ties its label through `field.labelProps` (`packages/rialto/src/components/TextArea/TextArea.tsx:101`). All 24 existing tests in the file pass unchanged.
- 2026-09-28 (Implement, M1.2): the guard is `constants/confirmation-copy.source.test.ts` (4 tests). Live-guard proof, both scratch files removed and never staged:
  - A scratch `src/components/scratch-sc4-probe.ts` holding the literal failed two tests: `AssertionError: Read CONFIRMATION_COPY instead of retyping the sentence in:\n  components/scratch-sc4-probe.ts` (exact-sentence and fragment checks), `Tests 2 failed | 2 passed (4)`.
  - A scratch `src/components/scratch-sc4-apos.tsx` holding the JSX retype `It&apos;s on your reservation for the team.` passed the exact-sentence check and failed only the fragment check (`Tests 1 failed | 3 passed (4)`), which is the case the fragment exists for.
  - After removal: `Tests 4 passed (4)`. Cross-check `git grep -l "Noted. It's on your reservation for the team." -- apps/hospitality/src ':!*.test.*'` printed exactly `apps/hospitality/src/constants/confirmation-copy.ts`.
- 2026-09-28 (Implement, M1.3): RED was `TypeError: specialRequestsText is not a function` on all 8 new cases; GREEN `Tests 20 passed (20)`, the module's 12 existing tests included.
