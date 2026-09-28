---
stage: architect
run: feature:remembered-on-arrival
date: 2026-09-28
assumptions:
  - "Copy source: `apps/hospitality/src/constants/confirmation-copy.ts` exports a frozen `CONFIRMATION_COPY` (`specialRequestsLabel`, `acknowledgement`, `hostCaption`) and `contactLine(contact)`. It lives in the app, not in a package. All five surfaces and the booking form are in `@mbe/hospitality` (`components/booking-widget/`, `components/timeline/`, `pages/`), so no package boundary, dependency-graph edge or changeset is involved. Precedent: `constants/session-lapse-copy.ts`. What would change it: the seeded widget-confirmation-send capture run needing the acknowledgement server-side; then it moves to a shared package in that run."
  - "Presence and displayed-text rule: one pure `specialRequestsText(notes): string | null`, added to `utils/reservation-display.ts`. It returns `null` when `notes` is null, undefined or empty after `String.prototype.trim()`; otherwise it returns the trimmed string. `trim()` strips Unicode White_Space, line terminators and the BOM, and is read as the PRD's 'leading and trailing whitespace'. There is no separate `hasSpecialRequests`. Presence is `!== null`, so presence and display cannot follow two rules."
  - "`GuestDetailsForm`'s field label (`GuestDetailsForm.tsx:213`) reads `CONFIRMATION_COPY.specialRequestsLabel`; the text is unchanged. The label SC4 says is 'defined once' then has one definition, and the echo cannot drift from the field the guest typed into. The form's hint (`:210`) is untouched (PRD out of scope)."
  - "Grid clearance: `TimelinePage` owns the tablet sheet's More state (`sheetExpandedFor: string | null`, keyed by reservation id, reset in `clearSelection`). It derives the size once per render with the pure `reservationSheetSize(notes, expanded)`, passes `expanded` / `onToggleExpanded` to `ReservationSheet`, and passes the matching Drawer block-size to `TimelineGrid` as `bottomInset`. A consequence: the pre-existing after-More gap (ux.md surfaced) closes too."
  - "`bottomInset` changes from a px `number` to a CSS length `string`. The page passes rialto Drawer's own formulas: `min(40vh, 240px)` for compact and `min(50vh, 480px)` for default (`Drawer.module.css:94`, `:57`). A px table cannot be right, because the default sheet is 384 px at 1024×768 and 480 px at 768×1024. The two formulas are mirrored in `components/timeline/sheet-size.ts` and pinned by a drift-guard test that reads `packages/rialto/src/components/Drawer/Drawer.module.css` (precedent `TableShape.test.tsx:19-22`, sanctioned by `apps/hospitality/CLAUDE.md:103`)."
  - "The existing E2E assertion `toHaveCSS('scroll-padding-block-end', '240px')` (`timeline-interaction.spec.ts:226`: Carol, no notes, 1024×768) is kept. It relies on Chromium resolving `min(40vh, 240px)` to `240px` in the computed value, which was not measured here. If Chromium serialises it otherwise, the line is replaced by the numeric comparison the new assertions use: the computed padding within 1 px of the sheet's bounding-box height."
  - "Rendering: rialto has no wrapping primitive. `Text` (`packages/rialto/src/components/Text/Text.tsx:25`, `:100`) forwards `HTMLAttributes` (so `id`, `dir` and `className`) and offers only `truncate`. No CSS under `packages/rialto/src` declares `white-space: pre-wrap`, `overflow-wrap` or `word-break` (the grep returns nothing). The words are therefore one `{text}` child of a rialto `Text` with `dir=auto` and an app CSS-module class declaring `white-space: pre-wrap; overflow-wrap: anywhere;`. These are keyword values, not tokens. The contact line gets `overflow-wrap: anywhere` only."
  - "SC1's 'both lines render on separate lines' is proven in jsdom two ways. The words element has exactly one text-node child whose value keeps the `\\n`, and a CSS-text test pins `white-space: pre-wrap` on its class. Playwright measures the real line boxes once: `Range.getClientRects()` over the text node yields at least two distinct tops."
  - "The two ticket surfaces share one new component, `components/timeline/SpecialRequestsTicket.tsx` (+ `.module.css`, `.test.tsx`). The change orphans `.notesValue` in `ReservationDetails.module.css:9-15`, so the rule moves into the new module. The guest surfaces and the Briefing card render their block inline, because their wrapper, heading level and type scale differ (ux.md § The one shared block)."
  - "`ConfirmationView.test.tsx:8-23` and `BriefingPage.test.tsx:55-148` mock rialto with stubs that drop `id`, `as`, `dir`, `role` and `aria-*` (`:22`; `:134`, `:140-148`). Those stubs are widened to forward their remaining props and honour `as`, and the `ConfirmationView.test.tsx` mock gains `Stack`, so that `getByRole('group', { name })` resolves. The files are not switched to real rialto."
  - "Local Playwright follows the booking-guest-reuse precedent (`docs/features/booking-guest-reuse/breakdown.md:247`, `verification.md:15`): a scratch config outside the repo, a synthetic OIDC session in the gitignored `e2e/.auth/user.json`, and `--no-deps --project=chromium`. The committed CI job (`e2e.yml`, `Hospitality E2E`, advisory) runs the same specs with real Auth0 secrets."
  - "E2E data: the host spec uses the committed fixture `res_e2e_002` (Bob Smith, notes `Birthday celebration`). The guest-page specs register spec-local route overrides after `mockApi`, following the `booking-widget-calendar.spec.ts` precedent: the public confirm returns a 2,000-character note containing a 300-character unbroken run, the hold gets a future expiry, the recognise lookup is stubbed, and `**/public/v1/reservations/manage*` is answered. `api-mocks.ts` is unchanged."
  - "No changeset: no published package's source changes. Rialto is untouched, and `@mbe/hospitality` is `private: true`."
  - "SC4's grep is scoped to `apps/hospitality/src` and excludes `*.test.*`. The generated `apps/hospitality/llms-full.txt` and root `llms-full.txt` embed source text (they already carry `session-lapse-copy.ts`'s strings). They would match the acknowledgement, and they are not source files."
surfaced:
  - "No committed local E2E harness exists. The hospitality-service-ux `e2e/.ux-audit/` config (its `verification.md:7`) is listed in `.git/info/exclude` and is no longer on disk anywhere under the checkout or its worktrees. booking-guest-reuse rebuilt the harness from prose in its scratchpad, and every run repeats that. Seed candidate: a committed mocked-session Playwright project. Not in this run's scope."
  - "`bottomInset` still governs only scrolls inside the grid box. The page's vertical scroller is `.timelineArea`, not `.gridWrapper` (hospitality-service-ux `breakdown.md:228`, item 16 note 5). A block the Host clicks low in the grid can sit under a tall sheet until something scrolls it. This run makes the padding equal the sheet in every state and does not widen that contract."
  - "Behaviour change for Review: lifting More's state also closes the pre-existing after-More clearance gap. Reselecting a reservation after closing the sheet still opens it at its derived size, matching today's reset on unmount."
  - "The E2E walk-in mock stamps `notes: 'Walk-in'` (`e2e/api-mocks.ts:485`, `realtime-collaboration.spec.ts:44`), while a real walk-in stores `notes: null` (`services/reservations/src/services/reservation.ts:622`). In E2E, a walk-in therefore shows a Special Requests block with the host caption and opens the tablet sheet tall. No spec asserts the tablet sheet after a walk-in today, so the mock is left alone. This is flagged for `e2e-selector-drift-reviewer`."
  - "The widget sends notes untrimmed (`useBookingFlow.ts:613`, `details.notes || undefined`), so a whitespace-only request is stored. Display trims it and storage stays as it is (PRD)."
  - "Carried forward, not decided here. The PRD open questions (allergy reminder, staff-edited notes being guest-visible, the manage page's 'confirmation email' copy) belong to Matt. ux.md's surfaced items (EditReservationDrawer's 'Notes' label, sibling card-title contrast, the manage page's inline literals, and the stale 'phone's bottom sheet' comment at `ReservationSheet.tsx:38-43`) stay unfixed."
---

# Architecture: Remembered on arrival

## Approach

The feature echoes a field that every surface already holds in memory, at render time. So the design is two small policy modules and five surfaces that read them, and nothing crosses a process.

`Reservation.notes` already reaches all four data paths: the widget's confirm response, the manage GET, the timeline's reservation list and the briefing (PRD § Problem statement). No request, schema, route, `@mbe/types` or `@mbe/api-client` change is needed (SC10).

**Policy.** `constants/confirmation-copy.ts` owns the four strings (SC4, SC8). `specialRequestsText(notes)` in `utils/reservation-display.ts` answers whether there is a request and what text shows (SC5 and the PRD's _displayed text_).

**Detail.** Each surface renders the UX block with rialto `Text`, `Stack` and `Card`. The guest's words are one text node under a CSS wrapping rule (SC6, SC9). The two ticket surfaces share `SpecialRequestsTicket`, because their markup is identical.

**The one structural change is on the tablet.** The sheet's height now depends on the reservation. `TimelinePage` already composes the grid and the sheet, so it becomes the single owner of the sheet's size. It derives the size with a pure `reservationSheetSize(notes, expanded)` and hands the grid the matching Drawer block-size as its scroll padding.

Two whole shapes were compared:

- **One universal `SpecialRequestsBlock`** with variant props for all five surfaces. Rejected: the guest variants differ in wrapper, heading level and type scale, and the Briefing has no line. The component would expose about as many presentational props as it hides lines.
- **Policy modules, per-surface markup and one shared ticket.** Chosen.

## Components

All paths are under `apps/hospitality/src/` unless prefixed.

### `constants/confirmation-copy.ts` (new — policy: the voice)

- Responsibility: the only definition of the four strings, character for character from ux.md § Copy.
  - `CONFIRMATION_COPY = Object.freeze({ specialRequestsLabel: "Special Requests", acknowledgement: "Noted. It's on your reservation for the team.", hostCaption })`.
  - `hostCaption` is composed as `` `Guests see this with: “${acknowledgement}”` ``, with U+201C/U+201D outer quotes and a straight `'` in It's. The acknowledgement literal therefore exists once.
  - `contactLine(contact: string): string` returns the SC7 sentence with `contact` interpolated.
  - The shape follows `constants/session-lapse-copy.ts`. The module imports nothing.
- Collaborators: `ConfirmationView`, `ManageReservationPage`, `SpecialRequestsTicket`, `BriefingPage` and `GuestDetailsForm` (label only); every surface test.

### `utils/reservation-display.ts` → `specialRequestsText` (edit — policy: the fact)

- Responsibility: `specialRequestsText(notes)` returns `null` when there is nothing to echo. Otherwise it returns the displayed text, with the ends trimmed and the interior untouched. It is the one presence rule that every surface and the sheet size use. It sits beside the module's existing reservation display helpers (`STATUS_LABEL`, `formatReservationTime`).
- Collaborators: the five surfaces and `sheet-size.ts`.

### `components/timeline/sheet-size.ts` (new — policy: tablet sheet geometry)

- Responsibility:
  - `reservationSheetSize(notes, expanded): "compact" | "default"` returns default when More is open or there is a request (ux.md Screen 4, Height).
  - `SHEET_BLOCK_SIZE: Readonly<Record<ReservationSheetSize, string>>` is `{ compact: "min(40vh, 240px)", default: "min(50vh, 480px)" }`. These are the rialto Drawer's bottom heights (`packages/rialto/src/components/Drawer/Drawer.module.css:94`, `:57`).
  - It replaces `SHEET_INSET_PX = 240` (`TimelinePage.tsx:52-53`).
- Collaborators: `TimelinePage` (inset) and `ReservationSheet` (Drawer `size`). Both import it by path, not through the `components/timeline` barrel, because `TimelinePage.test.tsx:55` mocks that barrel wholesale.

### `components/timeline/SpecialRequestsTicket.tsx` + `.module.css` (new)

- Responsibility: ux.md's Ticket variant, defined once.
  - Takes `{ notes }`, calls `useId()` first (hooks before any return), and renders `null` when `specialRequestsText` returns `null`.
  - Otherwise renders a `Stack gap="2xs" role="group" aria-labelledby={id}` holding three elements:
    - the label: `Text id variant="label" color="secondary"`;
    - the host caption: `Text variant="caption" color="secondary" as="div"`;
    - the words: `Text variant="body" as="div" dir="auto" className={styles.notesValue}`.
  - `.notesValue` moves here unchanged from `ReservationDetails.module.css:9-15`, and gains `white-space: pre-wrap; overflow-wrap: anywhere;`.
  - The block holds no focusable element and no live region.
- Collaborators: `ReservationDetails` and `ReservationSheet`; `confirmation-copy`, `specialRequestsText`, rialto `Stack` / `Text`.

### `components/timeline/ReservationDetails.tsx` (edit)

- Responsibility: unchanged, except the Notes block (`:167-176`) becomes `<SpecialRequestsTicket notes={reservation.notes} />` in the same slot, after Status and before `StaffDepositSection`. The orphaned `.notesValue` rule leaves this module. The desktop sidebar and the phone drawer both render it (`TimelinePage.tsx:360-371`).

### `components/timeline/ReservationSheet.tsx` (edit)

- Responsibility:
  - Renders `SpecialRequestsTicket` between the signals row (`:124-135`) and the failure banner (`:137-143`).
  - Removes the notes block from the expanded section (`:207-216`), so More reveals the GuestCard, email, phone and deposit.
  - More's state leaves the component. The props gain `expanded: boolean` and `onToggleExpanded: () => void`, the Drawer's `size` (`:79`) becomes `reservationSheetSize(reservation.notes, expanded)`, and the `expandedFor` state (`:56-58`) is removed.
- Collaborators: `TimelinePage`, `SpecialRequestsTicket`, `sheet-size`.

### `components/timeline/TimelineGrid.tsx` (edit, prop type only)

- Responsibility: `bottomInset?: string`, a CSS length, replaces the px `number` (`:33-34`). Line `:216` passes it to `scrollPaddingBlockEnd` unchanged.

### `pages/TimelinePage.tsx` (edit)

- Responsibility: the single owner of the sheet's size.
  - New state: `const [sheetExpandedFor, setSheetExpandedFor] = useState<string | null>(null)`.
  - Derived value: `sheetExpanded = selectedReservation !== null && sheetExpandedFor === selectedReservation.id`.
  - `clearSelection` (`:211-214`) also resets the state. Today the same reset happens when the sheet unmounts.
  - `bottomInset` (`:424`) becomes `viewport === "tablet" && selectedReservation ? SHEET_BLOCK_SIZE[reservationSheetSize(selectedReservation.notes, sheetExpanded)] : undefined`.
  - The sheet (`:577-590`) receives `expanded={sheetExpanded}` and `onToggleExpanded`, an event handler that flips `sheetExpandedFor` between `null` and the selected id.
  - Everything is derived during render, with no effect and no measurement.

### `pages/BriefingPage.tsx` + `.module.css` (edit)

- Responsibility: `BriefingCard` (`:107`) replaces the unlabelled line (`:174-178`) with ux.md's Briefing variant. It is a `Stack gap="2xs" role="group" aria-labelledby={id}`, with `id` from a `useId()` called at the top of `BriefingCard` (never inside the conditional), holding two elements:
  - the label: `Text variant="label" color="secondary"`;
  - the words: `Text variant="caption" color="primary" dir="auto" className={styles.requests}`, upright, with the wrapping rule.
- There is no caption on this surface. The staff note (`:180-184`, `.notes`, italic) is untouched.

### `components/booking-widget/ConfirmationView.tsx` + `.module.css` (edit)

- Responsibility, in two parts.
  1. **A Special Requests card**, placed right after the details card (`:95-154`) and before the deposit card (`:156`). It is a `div.detailsCard role="group" aria-labelledby={id}` holding:
     - the title: `Text id variant="label" as="h3" color="secondary" className={styles.detailsTitle}`;
     - a `Stack gap="sm"` holding the acknowledgement (`Text variant="caption" color="secondary"`) and the words (`Text variant="caption" color="primary" dir="auto" className={styles.requestsText}`).
  2. **The contact line** (`:182-187`) keeps its slot, condition and styling. Its text becomes `contactLine(reservation.guestEmail || reservation.guestPhone)`, and it gains `className={styles.contactLine}` (`overflow-wrap: anywhere`).
- `useId` and `Stack` are new imports.

### `components/booking-widget/GuestDetailsForm.tsx` (edit, one prop)

- Responsibility: `label={CONFIRMATION_COPY.specialRequestsLabel}` at `:213`. The rendered text is unchanged.

### `pages/ManageReservationPage.tsx` + `.module.css` (edit)

- Responsibility:
  - Delete the row at `:195-202`.
  - Add a `Card role="group" aria-labelledby={id}` after the details card and before Add to Calendar. Inside it:
    - an inner `Stack gap="md" className={styles.cardInset}` with `padding: var(--rialto-space-lg)`, not the page's inline `"1.5rem"`;
    - the title: `Text as="h2" id variant="label" color="secondary"`;
    - a `Stack gap="sm"` holding the acknowledgement (`Text variant="body" color="secondary"`) and the words (`Text variant="body" dir="auto" className={styles.requestsText}`).
  - The card renders for every status, CANCELLED included (ux.md assumption).
  - `useId()` joins the page's other hooks, above the early returns for a missing token, loading and error (`:102-137`).

### `apps/hospitality/e2e/special-requests.spec.ts` (new) + `timeline-interaction.spec.ts` (edit)

- Responsibility: the SC3 host-ticket spec, the SC9 checks of the guest pages at 375 px, and the grid-clearance regression guard. See § Test strategy.

## Data model

Nothing changes in persistence, the schema, the wire format or storage (SC10; the PRD forbids trimming in storage). The feature adds render-time values derived from data each surface already fetched.

| Value            | Shape                                 | Owner (invariant)                                                                           | Access pattern                                                                                                                                               |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Displayed text   | `string \| null`                      | `specialRequestsText`: `null` means no block anywhere                                       | Per render, from `Reservation.notes` (confirm response, reservations list), `ManagedReservation.notes` (manage GET) and `BriefingEntry.notes` (briefing GET) |
| Copy             | three frozen strings and one template | `confirmation-copy.ts`: the acknowledgement literal exists once                             | Import                                                                                                                                                       |
| Sheet size       | `"compact" \| "default"`              | `reservationSheetSize`: the sheet's `size` and the grid's padding come from the same inputs | Per render in `TimelinePage`, from `selectedReservation.notes` + `sheetExpandedFor`                                                                          |
| Sheet More state | `string \| null` (a reservation id)   | `TimelinePage`: reset by `clearSelection`, keyed by id so a new selection starts collapsed  | Set only by the More button's handler                                                                                                                        |

Consistency: each surface shows the value its existing query returned. Nothing is cached or reconciled beyond that. The manage page shows the current stored `notes`, including staff edits (pre-existing; PRD open question 3).

## Interfaces & contracts

### `specialRequestsText(notes: string | null | undefined): string | null`

- Input: the stored field. Every caller's type is `string | null`: `Reservation`, and the manage schema's `notes: z.string().nullable()` (`packages/api-client/src/reservations.ts:66`). `undefined` is also accepted, so an absent field reads as empty.
- Output: `null` for `null`, for `undefined`, and for any string that is empty after `trim()` (`""`, `"   "`, `"\n\t "`). Otherwise it returns `notes.trim()`, with interior spaces and `\n` kept.
- Failure modes: none. The function is total over its input type and never throws. A non-string value cannot arrive from the typed and validated sources; that invariant is noted, not defended.

### `CONFIRMATION_COPY` / `contactLine(contact: string): string`

- Output: the exact ux.md § Copy strings. `contactLine` interpolates `contact` verbatim, and React renders it as text.
- Contract for callers:
  - Render each value as `{value}`. Never put it in JSX text, which keeps `react/no-unescaped-entities` off the apostrophe, and never pass it through `dangerouslySetInnerHTML`.
  - Call `contactLine` only when an email or phone is present (today's condition). Pass the email if present, else the phone.
- Failure modes: none.
- For the SC11 production grep: the bundle carries the acknowledgement literal and `contactLine`'s static prefix, `No confirmation email or text is sent for this booking, so save these details. The venue has `. Grep for those, not for the interpolated sentence.

### `reservationSheetSize(notes, expanded): ReservationSheetSize` / `SHEET_BLOCK_SIZE`

- Input: `notes: string | null | undefined`, `expanded: boolean`.
- Output: `"default"` when `expanded` is true or `specialRequestsText(notes) !== null`, else `"compact"`. `SHEET_BLOCK_SIZE[size]` is the Drawer's own CSS formula for that size.
- Failure modes: none at runtime. The risk is drift: if rialto changes a bottom-sheet height, the mirror goes stale silently. So `sheet-size.test.ts` reads `packages/rialto/src/components/Drawer/Drawer.module.css`, resolved from `process.cwd()` as in `TableShape.test.tsx:19-22`, and asserts that the `.bottom` and `.compact.bottom` heights equal the two values.

### `ReservationSheet` props (changed)

- Input: today's props (`ReservationSheet.tsx:20-36`), plus `expanded: boolean` and `onToggleExpanded: () => void`.
- Output:
  - The Drawer gets `size={reservationSheetSize(reservation.notes, expanded)}`.
  - The More button gets `aria-expanded={expanded}`, and `aria-controls` only while expanded (unchanged rule).
  - `SpecialRequestsTicket` sits above the actions whenever a request is present.
- Failure modes: unchanged (the Seat Guest banner).

### `SpecialRequestsTicket({ notes })`

- Output: nothing, or the group described in § Components.
- Failure modes: none (pure render).

### `TimelineGrid.bottomInset?: string` (changed)

- Input: any CSS `<length>`. `undefined` means no padding (`:216`).
- Output: `scroll-padding-block-end` on the grid scroller. It still governs only scrolls inside the grid box (see `surfaced`).

### The block's DOM contract (all five surfaces; what tests and E2E select on)

- `getByRole("group", { name: "Special Requests" })` finds the block. The group's name comes from `aria-labelledby`, which points at the `useId()` id of the label or heading.
- Inside the group comes the line first: the acknowledgement, the host caption, or nothing (on the Briefing). Then comes one element whose only child is a single text node equal to the displayed text. That element has `dir="auto"` and a class declaring `white-space: pre-wrap; overflow-wrap: anywhere`.
- When `specialRequestsText` returns `null`, the block is absent entirely: no wrapper, no label, no gap.
- The block contains no focusable element, no `aria-live`, and no element derived from the guest's text.

### Cross-process

None added. No fetch, retry or timeout changes. Every value comes from queries that already run under the api-client's existing contract.

## Test strategy

Unit and component tests run in vitest in `apps/hospitality` (`pnpm test` from inside the package). Surface tests import `CONFIRMATION_COPY` and `contactLine` rather than retyping the strings (SC4).

Fixtures:

- **Two-line note:** `"  Our anniversary.\nWindow seat if you can, and she can't have tree nuts.  \n"`. The displayed text trims the ends.
- **Untrusted note:** `<script>alert(1)</script>\n<a href="https://x">x</a> &amp; "double" 'single'`.
- **Empties:** `null`, `""`, `"   "` and `"\n\t "`, run as an `it.each`.

| SC   | Where                                                                                                                                             | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC1  | `ConfirmationView.test.tsx`; SC9 spec                                                                                                             | The group is named by the label and holds the acknowledgement. The words element has one text-node child equal to the displayed text, `\n` included, and carries `dir="auto"`. A CSS-text test pins `white-space: pre-wrap` on `.requestsText`. In Playwright, `Range.getClientRects()` over the text node has at least two distinct tops.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| SC2  | `ManageReservationPage.test.tsx`                                                                                                                  | The same checks as SC1, through the real api client and `mockFetch` (the file's existing pattern). The details card no longer contains `Special Requests`, and the group appears once.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| SC3  | `SpecialRequestsTicket.test.tsx`, `ReservationDetails.test.tsx`, `ReservationSheet.test.tsx`, `BriefingPage.test.tsx`, `special-requests.spec.ts` | **Ticket:** label, caption, text and group. **Details:** `Special Requests` present, `Notes` absent. **Sheet:** this run **inverts `ReservationSheet.test.tsx:227-245`** ("reveals the GuestCard, email, phone and notes only once expanded") on purpose. Its notes half becomes "Special Requests is visible before More"; its GuestCard/email/phone half stands. A new test covers a sheet with notes: it opens at `default`, and More toggles only `aria-expanded` and the revealed content. `:212-225` stays, for a reservation without notes. **Briefing:** the group labelled Special Requests contains the guest's words; the staff note sits outside that group and carries no label. **Playwright:** Bob Smith (`res_e2e_002`, `Birthday celebration`) on the desktop sidebar (1280×720) and on the tablet sheet (1024×768), where the group is `toBeInViewport()` without pressing More. |
| SC4  | `confirmation-copy.test.ts`                                                                                                                       | Pins the four literal values, including the host caption's U+201C/U+201D. Verify runs `git grep -l "Noted. It's on your reservation for the team." -- apps/hospitality/src ':!*.test.*'`, which must list exactly `constants/confirmation-copy.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| SC5  | `reservation-display.test.ts`, each surface test, `sheet-size.test.ts`                                                                            | `specialRequestsText` returns null for the four empties, trims the ends and keeps the interior. Each surface runs an `it.each` over the four empties and asserts no group, no label, no line and no card or container (ConfirmationView: the `detailsCard` count is unchanged; Manage: the `Card` count is unchanged). The sheet stays compact for `"   "`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| SC6  | `ConfirmationView.test.tsx`, `ManageReservationPage.test.tsx`, `SpecialRequestsTicket.test.tsx`                                                   | With the untrusted note, the text content equals the literal characters, `group.querySelector("script, a")` is null, and the words are one text node. Verify: `git diff origin/main...HEAD -- apps/hospitality/src \| grep dangerouslySetInnerHTML` prints nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| SC7  | `ConfirmationView.test.tsx`                                                                                                                       | `:169` becomes `getByText(contactLine("john@example.com"))`. The phone-only case asserts `contactLine("+15551234")`. `:190` becomes "no contact line when there is neither an email nor a phone". In every case, `queryByText(/A confirmation has been sent/)` is null. The old assertions are replaced, not deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| SC8  | `confirmation-copy.test.ts`                                                                                                                       | Case-insensitive: none of the PRD's first list appears in `acknowledgement` or `hostCaption`, and none of its second list appears in `contactLine("x@y.z")`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| SC9  | each surface test; `special-requests.spec.ts`                                                                                                     | Group names resolve, and there is no `[aria-live]` inside or around the block. At 375×812, ConfirmationView (driven through the widget flow) and ManageReservationPage, each with the 2,000-character note containing a 300-character unbroken run, satisfy `document.documentElement.scrollWidth <= window.innerWidth`. Review reads the diff to confirm the changed `.module.css` lines use only `--rialto-*` tokens or keyword values.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| SC10 | Verify                                                                                                                                            | Check `git diff --name-only origin/main...HEAD` against the excluded list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| SC11 | Ship / Verify                                                                                                                                     | Production probe per the grep contract in § Interfaces, plus a check that the console shows no CSP refusal. The evidence gap is recorded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| SC12 | gates                                                                                                                                             | See § Stack & dependencies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Grid clearance** (the hospitality-service-ux Screen 4 regression that UX surfaced):

- `sheet-size.test.ts` covers the four input combinations and runs the Drawer mirror guard.
- `TimelinePage.test.tsx`: its `ReservationSheet` stub (`:144-145`) grows a More button wired to `onToggleExpanded`. The cases:
  - tablet, no notes → `SHEET_BLOCK_SIZE.compact` (replaces `toHaveTextContent("240")` at `:1564`);
  - tablet, notes → `SHEET_BLOCK_SIZE.default`;
  - More pressed → `.default`;
  - More, then close, then reselect → `.compact`;
  - desktop → empty.
- `TimelineGrid.test.tsx:757-761` passes `"240px"`.
- `timeline-interaction.spec.ts` gains two tests next to `:217-247`. For Bob at 1024×768, `parseFloat(getComputedStyle(grid).scrollPaddingBlockEnd)` is within 1 px of the sheet's bounding-box height (384). The same holds for Carol after pressing More. `:226` is kept (see `assumptions`).

**Test infrastructure:**

- The two rialto mocks are widened to forward their remaining props (see `assumptions`).
- `ReservationSheet.test.tsx`'s `renderSheet` (`:134`) renders through a small stateful harness that holds `expanded`, so the file's ten `moreButton()` interactions (`:172`) still drive the size.

## Verify's E2E path

Nothing committed can run hospitality Playwright locally without Auth0. `playwright.config.ts`'s `chromium` project depends on `setup`. `auth.setup.ts:16` calls `validateAuth0Config()` at module load, which requires the five `E2E_AUTH*` variables listed at `:8-9`, and none are available.

**The precedents.** The hospitality-service-ux run used a git-excluded `e2e/.ux-audit/playwright.suite.config.ts` with a synthetic unsigned-OIDC `storageState.json` (its `verification.md:7`). That directory is listed in `.git/info/exclude` and no longer exists anywhere under the checkout or its worktrees. The booking-guest-reuse run recorded a recipe that can be rebuilt (`breakdown.md:247`; `verification.md:15`):

- a scratch config outside the repo, with the same `testDir`, `testIgnore`, `workers: 1`, viewport and `actionTimeout`;
- its own port, served by `pnpm exec vite --port <p> --strictPort` rather than the committed `webServer`, whose `--port` is ignored;
- invocation with `--no-deps --project=chromium`;
- a synthetic OIDC session written to the gitignored `e2e/.auth/user.json` (`apps/hospitality/.gitignore:1`);
- `VITE_AUTH_*` pointed at an invalid host, and `VITE_API_URL` at the harness port.

`mockApi` answers every API route, so no token is ever verified.

**Verify's steps:**

- Run `special-requests.spec.ts`, `timeline-interaction.spec.ts` and the `booking-widget*.spec.ts` files through that recipe.
- Record the harness as an assumption and commit nothing from it.
- Dispatch `e2e-selector-drift-reviewer` on the E2E diff.

**In CI,** the `Hospitality E2E` job (`.github/workflows/e2e.yml`, triggered by `pull_request` on `apps/hospitality/**`) runs the committed specs through the real `auth.setup.ts`. That job is advisory and not part of `CI Gate`. New specs need no workflow wiring, because `e2e/workflow-coverage.test.ts` relies on Playwright's auto-discovery.

## Stack & dependencies

- **No new dependency.** `pnpm-lock.yaml`, `package.json` and the dependency graph are untouched. Rialto components used, each verified in `packages/rialto/src`:
  - `Text`: `variant` label/caption/body, `color` primary/secondary, `as`; forwards `id`, `dir` and `className` (`Text.tsx:25`, `:100`).
  - `Stack`: `gap` `2xs`/`sm`/`md`; forwards `role` and `aria-labelledby` (`Stack.tsx:23`, `:94`).
  - `Card`: forwards `role`, `aria-labelledby` and `className` (`Card.tsx:22`, `:77`).
  - `Drawer`: `size` already includes `"compact"` and `"default"` in its union (`Drawer.tsx:38`).
- **Tokens:** all are already used by the classes being reused or moved.
  - `--rialto-surface-recessed`, `--rialto-space-lg`, `--rialto-radius-soft` (`ConfirmationView.module.css:135-140`);
  - `--rialto-text-sm`, `--rialto-text-primary`, `--rialto-space-xs`, `--rialto-radius-sharp` (`ReservationDetails.module.css:9-15`);
  - `--rialto-space-lg` again, for the manage card's inset.
  - Wrapping uses keyword values (`pre-wrap`, `anywhere`), which are not tokens.
- **Changeset: none.** No published package's source changes: `packages/rialto` is untouched, and `@mbe/hospitality` is `"private": true` (`apps/hospitality/package.json:4`). If Implement finds a reason to touch rialto source, that item needs a `.changeset/*.md`, or Build fails CI Gate.
- **Generated artifacts:** run `pnpm build --filter @mbe/cli...`, then `pnpm regen`. This regenerates `llms.txt` and `llms-full.txt` for `apps/hospitality` and at the root. `pnpm regen --check` must then be clean.
- **Gates (SC12)**, run from `apps/hospitality`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm size` (the size-limit budgets; the copy adds a few hundred bytes).

## Decisions & alternatives

- **The page owns the sheet's size**, through the lifted More state and the pure `reservationSheetSize`. Three alternatives lost:
  - Keep More inside the sheet and derive the inset from notes alone. The pure function would knowingly return the wrong height after More, writing the pre-existing gap into code.
  - Measure the sheet with a `ResizeObserver`. That is an effect writing state for a value that is a function of two known inputs.
  - Add a `:has()` rule on `body`, keyed off the portaled Drawer. That is a hidden coupling across modules.
  - Cost of the choice: two props on the sheet, and a stateful harness in its test.
- **Drawer formulas as CSS strings** over a px table. No single px value is right for the default sheet across tablet heights: 384 at 768 tall, 480 at 1024 tall.
- **A CSS-reading test guards the mirror** over exporting sheet heights from rialto. A rialto export means a rialto change, a changeset and a build for one consumer. The guard is the app's documented drift pattern (`apps/hospitality/CLAUDE.md:103`).
- **Copy in `apps/hospitality/src/constants/`** over a shared package. Every consumer is in one app. `packages/api-client` and the `packages/types` request/response schemas are excluded. A new package would add a dependency-graph edge, llms families and a build step, with no second consumer.
- **`specialRequestsText` returns `string | null`** over a `hasSpecialRequests(notes): boolean` plus a separate trim. With one function, no surface can test presence with one rule and display with another.
- **One text node with `white-space: pre-wrap`** over splitting on `\n` into `<br>` or per-line elements. SC6's "no element created from the guest's text" then holds by construction, a screen reader gets one run of text, and ux.md Decision (f) asks for exactly this.
- **`overflow-wrap: anywhere`**, over two alternatives:
  - `overflow-wrap: break-word` does not shrink the min-content contribution, so a 300-character run can still widen a min-content context. `anywhere` does shrink it.
  - `word-break: break-all` breaks every word mid-word, not only the overlong one.
- **A shared `SpecialRequestsTicket` for the two tickets, with inline blocks elsewhere.** This beats the universal block rejected in § Approach. It also beats duplicating the ticket markup: two files would each carry the group, the caption and the box, and ux.md wants one treatment on every ticket.
- **Widen the two rialto test mocks** over switching those test files to real rialto. The other tests in those files depend on the mocks. Forwarding the remaining props is the smallest change that lets `aria-labelledby` resolve.
- **`GuestDetailsForm` reads the label constant** over keeping its own literal. UX defines the echo's label as "the same words as the form field", and one constant makes that true in code rather than by convention.
- **`bottomInset: string`** over `number | string`. No number caller remains.
- **Spec-local route overrides** over editing the shared confirm and manage mocks in `api-mocks.ts`. Other specs rely on the confirm mock returning `reservations-list.json`'s first row (`booking-widget-calendar.spec.ts:4-8`), and no manage mock exists to extend.

## Traceability

| Requirement                                                  | Component(s)                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| US1: the confirmation shows my request with an honest line   | `ConfirmationView` card, `CONFIRMATION_COPY.acknowledgement`, `specialRequestsText`                           |
| US2: the confirmation tells the truth about sends            | `ConfirmationView` contact line, `contactLine`                                                                |
| US3: the manage page shows it the same way                   | `ManageReservationPage` card, the same copy and rule                                                          |
| US4: the ticket shows the guest's label and what guests see  | `SpecialRequestsTicket` (label + `hostCaption`) in `ReservationDetails` and `ReservationSheet`                |
| US5: visible without More, set apart on the Briefing         | `ReservationSheet` placement + `reservationSheetSize`; the `BriefingCard` label group                         |
| SC1, SC2: echo on the guest pages                            | `ConfirmationView`, `ManageReservationPage`, `specialRequestsText`, `CONFIRMATION_COPY`                       |
| SC3: host ticket, sheet without More, Briefing label         | `SpecialRequestsTicket`, `ReservationDetails`, `ReservationSheet`, `BriefingCard`, `special-requests.spec.ts` |
| SC4: one copy source                                         | `constants/confirmation-copy.ts` (+ `GuestDetailsForm`'s label)                                               |
| SC5: empty renders nothing                                   | `specialRequestsText` (the single presence rule), each surface's `null` branch                                |
| SC6: untrusted text stays text                               | the block's DOM contract (one `{text}` node), React text rendering                                            |
| SC7: honest contact line                                     | `contactLine`, `ConfirmationView`                                                                             |
| SC8: honesty limits                                          | `confirmation-copy.test.ts`                                                                                   |
| SC9: accessible and legible                                  | `role="group"` + `aria-labelledby`, `dir="auto"`, the wrapping classes, the 375 px Playwright checks          |
| SC10: no excluded change                                     | the whole design: only `apps/hospitality` source and tests, plus the regenerated app and root llms files      |
| SC11: production evidence                                    | the grep contract on `CONFIRMATION_COPY` / `contactLine`; Ship's probe                                        |
| SC12: gates                                                  | § Stack & dependencies                                                                                        |
| UX-surfaced: grid clearance                                  | `sheet-size.ts`, `TimelinePage` (lifted More state), `TimelineGrid.bottomInset: string`                       |
| UX-surfaced: pinned test `ReservationSheet.test.tsx:227-245` | inverted on purpose (§ Test strategy, SC3)                                                                    |
| UX recommendation: one text node                             | the block's DOM contract                                                                                      |

## ADRs

None. No decision met the bar: each one is a single module or a single prop, reversible in a commit. The least obvious one, lifting More's state into the page, is recorded here and in `assumptions`.
