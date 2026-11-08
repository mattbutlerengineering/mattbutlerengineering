---
stage: architect
run: feature:availability-scenario-ux
date: 2026-11-08
assumptions:
  - "The Owner delegated; the trade-offs that could have gone another way are listed under Decisions with the recommendation taken."
  - "No API, schema, engine or dependency change. No ADR: every decision is a two-way door undone by a revert with no data consequence."
---

# Architecture: Availability, the everyday edits

Builds on `prd.md` and `ux.md` (commit `2bb6de2ae`) and on feature:availability-setup-hierarchy's components (week panel, page frame, service-hours text). Presentation, defaults and wording in `apps/hospitality`; nothing below the client changes.

## Approach

Four independent slices plus the e2e suite: (A) the shared week form's days control and preset placement, (B) the week panel's pinned footer with the Booking line and the Select… alignment, (C) the Close dialog's dates, times, steps, titles and toasts, (D) quiet month cells and a legend. Each is pure functions plus the component that renders them, so the rules are unit-tested without the page.

## Components

### A1. Days control (adapter)

- `quick-setup-fields.tsx` `DayPicker`: shortcuts gain **Fri–Sat** (`[5, 6]`); the seven day inputs stay `Checkbox` (styled as chips by the existing CSS). `QuickSetupForm.tsx` `DaysField`: the `inDrawer` fold (`:66`) and its "Change days" button are removed; the `fixedDays` text summary stays. Block days (`QuickSetupBlock.tsx`) get the same shortcut row.
- Owns PRD 1. Collaborators: `QuickSetupServiceRow` (unchanged focus targets).

### A2. Preset placement (policy)

- `quick-setup-draft.ts` (as built: `quick-setup-placement.ts`, preset defaults kept when clear, see breakdown Notes): `placePreset(draft, serviceId, preset): QuickSetupService` — the preset's name and length; start = latest `closesAt` among the other services whose effective days intersect this service's effective days, if placing there keeps every affected day's earliest open → latest close ≤ `MAX_PAST_MIDNIGHT_SPAN` (the rule `spanIssues` enforces) and the service does not run past 48:00; else the preset's own times. `applyPreset` callers in `QuickSetupServiceRow` use it. `firstClearStart(draft, serviceId): number | null` — the earliest start ≥ the service's current start that clears every overlap on its days within the same span rule, in 15-minute steps, or `null`.
- `QuickSetupIssue` with `code: "overlap"` gains an optional `fix: { serviceId, opensAt }` computed in `validateDraft`; `IssueText` renders the action "Move {{service}} to {{time}}" that applies `withStart(service, opensAt)` through the form's `onChange`.
- Owns PRD 2.

### B1. Pinned footer (adapter)

- `RegularWeekPanel.tsx`: the footer gets `data-pinned` when dirty; `RegularWeekPanel.module.css` `.footer[data-pinned] { position: sticky; bottom: 0; background: var(--rialto-surface…); border-block-start: … ; z-index above form content }`. The page's scroll container is the dashboard main area, so sticky resolves against it (no JS measurement).
- Owns PRD 3.

### B2. Booking line button and Select… alignment (adapter)

- `SchedulesTab.tsx`: the Booking line moves directly after `RegularWeekPanel` and becomes a `Button variant="ghost"` (full line text + "Change"); new prop `onBookingRules()` from `AvailabilityPage` (the existing `setBookingRulesOpen(true)`). The header ⋯ item stays.
- `AvailabilityToolbar.tsx`: `DropdownMenu align="right"` for Select… on every viewport.
- Owns PRD 9, 10.

### C1. Close dialog dates and times (policy + adapter)

- `holidays.ts`: `holidaysWithin(country, today, days = 60): Holiday[]` from `holidaysIn` (this year and next), planned dates included. `CloseStepOne.tsx` renders the chip row (Tonight, Tomorrow, then holidays) above the When radios; a chip patches `when` to `{ kind: "tonight" }` or `{ kind: "date", date }`.
- `close-draft.ts` `startMinutes(config, timezone, dates, keep, nowMinute?)`: options run from `max(firstOpen floored to the half hour, nowMinute rounded up to the next half hour when the only date is today)` to the half hour before the last close, instead of from 0; overnight days keep "(next day)". `CloseDialog` passes the venue clock's minute for today.
- Range and Repeats initial `to = ""` (was today + 90) in `CloseStepOne` / `close-draft` defaults; `whenIsComplete` already requires it, so the primary stays disabled until To is chosen.
- Owns PRD 7.

### C2. Close dialog steps, title and toasts (policy + adapter)

- `close-draft.ts` `willHaveStepTwo(groups, givenBack): boolean` — the same condition `next` uses (`groups.length > 0 || givenBack`); `CloseDialog` renders "Step {{step}} of 2" only when it is true (or on step 2).
- Title: `closing.pause ? "Pause online booking" : "Close"` (edit keeps "Edit closure").
- `closeToastText(draft, outcome, t, format): string` — pure, one branch per What × When per ux.md F4.7, with new keys `availability.close.toast.closedOn`, `.serviceClosedOn`, `.bookingPausedOn` (channel list), `.closedFrom`, `.serviceClosedFrom`, `.serviceClosedMany_*`; existing `.closedSection`, `.paused`, `.notified_*` kept.
- Floor-plan hint renders inside the disabled One section choice's description.
- Owns PRD 5, 6.

### D1. Quiet month cells and legend (policy + adapter)

- `day-summary.ts` (as built: `toDifference(dayDifferences(...))`, see breakdown Notes): `dayDifference(day, regularScheduleId, sectionNames, t): { chip: string; more: number } | null` — `null` when the day uses the regular schedule, has no closures, every booking channel is open and its label is the schedule's own; otherwise the first of Closed › service closed › section closed › booking paused › Special hours › schedule name, with `more` = further differences. `monthLegend(days, …): string` from the visible month's in-month cells: each chip label with the weekdays it falls on when they form a weekly pattern across the month, else a day count.
- `AvailabilityCalendar.tsx` month cells render the date, holiday and the chip (or nothing); the legend renders above the grid in month view; the accessible name keeps today's full description.
- Owns PRD 8.

### E1. Scenario suite (test adapter)

- `e2e/availability-everyday.spec.ts`: R1-R11 and PRD 11's demo on the ux.md fixtures, counting with `helpers/interaction-counter.ts`; F-close today pinned (Nov 8, 2026, 12:00 PM; 6:00 PM for R6). Existing specs that assert "Change days", the toast wording, "Step 1 of 2", month-cell text or the Booking line position are updated deliberately.
- Owns PRD 4, 11 evidence; 12.

## Data model

Unchanged.

## Interfaces & contracts

- `placePreset` / `firstClearStart`: inputs are the draft and a service id; outputs a service / a minute or `null`; never throw; minutes past 24:00 mean next day as everywhere in the form.
- `startMinutes(…, nowMinute?)`: `nowMinute` only narrows a single-date-today list; with several dates or a future date it is ignored.
- `dayDifference` / `monthLegend`: pure over `AvailabilityDaySummary`; a summary from an older API without `scheduleId` reads as "differs" only when its label is not the regular schedule's name.
- `closeToastText`: input is the submitted draft and the server outcome; output one string.

## Stack & dependencies

None new. i18n keys in en-US, es-MX, fr-CA with key parity.

## Decisions & alternatives

- **Keep checkbox inputs for day chips** over toggle buttons — the form's focus rules target `input`, block days are checkboxes, and specs address checkboxes; restyling keeps one control (ux.md UXR-5).
- **Preset placement in the draft module** over a smarter preset list — the rule needs the other services' days and the span limit the validator already owns; one place, unit-testable.
- **Sticky CSS footer** over a fixed bottom bar with JS — sticky follows the scroll container, needs no measurement and leaves the flow when not dirty.
- **To starts empty for Range/Repeats** over teaching Rialto `Calendar` an open-on-month prop — the empty value makes the existing `min` rule (#8511) open on From's month; a primary disabled until To is chosen is already the behaviour for an incomplete When.
- **Difference ranking in a pure function** over CSS-only hiding — the legend, the chip and the accessible name must agree; one ranking.

## Accepted behaviour changes

| Input                                                    | Today                                                             | After                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Ticking days in a drawer                                 | folds to "Days: … · Change days"                                  | chips stay                                            |
| Shortcuts                                                | Weekdays, Weekends, Every day                                     | + Fri–Sat                                             |
| Preset on a second service (Late beside Dinner to 11 PM) | 10:00 PM–1:00 AM, overlap error                                   | 11:00 PM–2:00 AM, no error                            |
| Overlap from typed times                                 | message only                                                      | message + "Move X to HH:MM" when a clear start exists |
| Unsaved week edits                                       | footer at the end of the form                                     | footer pinned to the bottom while dirty               |
| Booking line                                             | static text at the bottom of Schedules                            | button under the week panel                           |
| Close dialog When                                        | radios only                                                       | + Tonight/Tomorrow/holiday chips                      |
| "Starting at" today                                      | from 12:00 AM                                                     | from the next half hour                               |
| Range/Repeats To                                         | today + 90                                                        | empty until chosen                                    |
| Step line                                                | "Step 1 of 2" always on step 1                                    | only when step 2 follows                              |
| Pause dialog title                                       | "Close"                                                           | "Pause online booking"                                |
| Toasts                                                   | "Thu, Dec 24 closed" for venue and service; "Booking paused on …" | names the target and channel                          |
| Month cell on a regular day                              | schedule name + service names                                     | date (+ holiday) only                                 |
| Month view                                               | no legend                                                         | "This month: …" legend                                |

## Requirement traceability

| PRD                     | Owned by                        |
| ----------------------- | ------------------------------- |
| 1 day chips             | A1                              |
| 2 presets               | A2                              |
| 3 Save in reach         | B1                              |
| 4 budgets               | A1, A2, B2, C1, D1; evidence E1 |
| 5 toasts                | C2                              |
| 6 true dialog           | C2                              |
| 7 dates and times       | C1                              |
| 8 quiet calendar        | D1                              |
| 9 Booking line          | B2                              |
| 10 menus                | B2                              |
| 11 demo                 | C1, C2, D1, E1                  |
| 12 locales, regressions | all; E1                         |

## ADRs

None (see assumptions).
