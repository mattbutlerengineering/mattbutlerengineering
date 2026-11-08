---
stage: architect
run: feature:availability-phone-tonight
date: 2026-11-08
assumptions:
  - "Client-only: no API, schema, engine or migration change. Every fact the Today line needs is already served: GET …/availability/days for the service day (closure bands with target, window, channels, service and section ids; open services with hours; label) and the config's date rules (night-of `tonight` rules)."
  - "Door: two-way. Reverting the PR restores #8528's page."
---

# Architecture: Availability on a phone, and what's on tonight

## A. The Today line

### A1. Model: `components/availability/today-line.ts` (new, pure)

```ts
export type TodayItem =
  | { kind: "serviceClosed"; name: string } // service or section, whole day
  | { kind: "closingEarly"; at: number; name: string | null } // venue (name null) / service / section from a time
  | { kind: "paused"; channels: readonly BookingType[]; from: number | null }
  | { kind: "tonight"; change: TonightChange }; // night-of rule, Timeline wording

export interface TodayLineModel {
  readonly serviceDate: string;
  readonly closed: boolean; // no open service that day
  readonly hours: readonly { name: string; opensAt: number; closesAt: number }[];
  readonly items: readonly TodayItem[];
}

export function todayLine(input: {
  serviceDate: string;
  summary: AvailabilityDaySummary;
  rules: readonly DateRule[]; // for activeTonightChanges
  now: Date;
  serviceNames: ReadonlyMap<string, string>; // venueServiceId → name
  sectionNames: ReadonlyMap<string, string>;
  bannerShowsOnline: boolean; // OnlinePausedBanner is up
}): TodayLineModel;
```

- **Hours:** `summary.services`, minus any service a whole-day service closure band covers, sorted by `opensAt`. `closed` = no hours left, or the summary's label is the closed label (the API says "Closed").
- **Items** from `summary.closures`:
  - A band counts as whole-day when it covers the service day's open span: `from` ≤ the first `opensAt` and `to` ≥ the last `closesAt`. The implementer verifies this against the engine's band shape in `packages/availability/src/resolve-day.ts`, where a from-time band runs to 2880.
  - The `booking` target gives `paused` (channels, and `from` when the band starts after the first open).
  - `venue`: whole-day → `closed`; from a time → `closingEarly{name:null}`.
  - `service` and `section`: whole-day → `serviceClosed`; from a time → `closingEarly{name}`.
- **Night-of:** `activeTonightChanges(rules, serviceDate, now)` (`tonight-state.ts`), mapped to `tonight` items.
- **Said once:**
  - With `bannerShowsOnline`, drop the night-of `pause_online` change and remove `online` from `paused` channels; a `paused` with no channels left is dropped.
  - Items whose rendered text is equal dedupe at render; the model keeps them distinct by kind.
  - A `closed` day has no `serviceClosed`, `closingEarly` or `paused` items. Night-of changes still show.

### A2. Text: night-of chip wording

`TonightControl.tsx` formats its chips inline (`:72-76`). Extract that formatting into an exported `tonightChipText(change, formatTime, t)` in `tonight-state.ts`, or a new `tonight-text.ts` if `tonight-state.ts` would pass 400 lines. `TonightControl` and the Today line both call it: one wording, no copy.

### A3. Data: `hooks/useTodayLine.ts` (new)

- Reuse `useStaffTonight(venueId)` for `serviceDate` and `rules`. Extend its return with the day `summary` and the `days` query status/refetch (additive fields; Timeline and Briefing keep working).
- Builds `serviceNames` from `config.services` and `sectionNames` from the same source the calendar uses.
- Returns `{ status: "loading" | "error" | "ready", model, retry }`.
- The React Query keys are shared, so Timeline, Briefing and the page dedupe requests. Saves on `/availability` already invalidate availability days and config, so the line follows a Close… or Pause.

### A4. View: `components/availability/TodayLine.tsx` + `TodayLine.module.css` (new)

- Rialto `Text`, `Tag` and `Link`.
- Renders the states in ux.md F1. Loading reserves one line's height through a CSS min-block-size, not a spinner.
- The link goes to `/timeline?tonight=open` through the app's routing helper. Timeline routes are venue-scoped since #8488; use the same helper the nav uses.

### A5. Page: `pages/AvailabilityPage.tsx`

- Mount `<TodayLine venueId bannerShowsOnline={pause !== null} />` after `pageHeader(...)` and before the `OnlinePausedBanner`.
- Hide it for an empty venue (the page's existing `isEmptyVenue` branch).
- No other page change. The page's own `today` (calendar date) is untouched; that's seeded.

### A6. Timeline deep link

- `TonightControl` gains `defaultOpen?: boolean` (initial `useState(defaultOpen ?? false)`).
- `TimelineTonight` reads `useSearchParams()`: `tonight=open` → `defaultOpen`. After opening, it removes the param (`replace`) so a reload or back does not reopen the panel.

## B. Phone service lines

### B1. Form prop

- `QuickSetupForm` gains `collapsible?: boolean`, default false.
- **Set it** where the viewport is phone (`useViewport() === "phone"`): `RegularWeekPanel`, `ChangeRegularWeekDrawer`, `ScheduleEditorDrawer`.
- **Never set it:** `QuickSetupCard` and onboarding (`useOnboardingWizard`) don't pass it.

### B2. State: in `QuickSetupForm`

- `openId: string | null`, default null.
- **Forced open:** derived as the set of service ids with any issue in `issues` (the form's existing per-service issue list). A service is open when its id equals `openId` or it is forced open. Derived, not stored, so fixing a problem releases it.
- **Add service:** sets `openId` to the new id. The existing name-focus effect still runs because the row mounts open.
- **Remove:** focuses the neighbour's header, via a ref map keyed by service id.
- **Opening another:** sets `openId` to it.
- **After a successful save:** the panel calls `onSaved`. The panel re-keys the form, or calls a `resetOpen` the form exposes through a key change. Prefer the key change the panel already does on reset, if there is one; otherwise reset `openId` when `draft` returns to the saved baseline. The implementer picks one and notes it.

### B3. View

- **Header:** new `ServiceLineHeader` in `quick-setup-line.tsx`, plus a CSS module or the form's own module.
  - It's a `button` with `aria-expanded` and `aria-controls`.
  - Its text comes from a pure `serviceLineText(service, draft, format, t)` in `quick-setup-line.ts`: name or `serviceN`, hours with "(next day)", days via `weekdaySummary`, " · other hours <days>" from the blocks.
  - With a problem it shows the first issue's message (via `issueMessage`) under the summary and has no chevron. Pressing it does nothing while the problem stands.
- `QuickSetupServiceRow` is unchanged inside: when `collapsible`, the form renders the header and, only if open, the existing row content under it. The legend stays for the fieldset. A closed service's fields are not mounted. That's safe because a closed service has no issues by construction, so nothing hidden needs `role="alert"` or focus.
- **Blocked Save:** `RegularWeekPanel`'s Save path, with no `focusFirstInvalid` today, gets the `QuickSetupCard.tsx:47-49` pattern: focus the first `[aria-invalid="true"]` in the form after a blocked Save. With collapsible, the services with issues are already open (forced), so the field exists. One helper is shared by `QuickSetupCard` and `RegularWeekPanel` (moved to `quick-setup-field-helpers.ts`).

## C. Files

New:

- `today-line.ts` + test
- `TodayLine.tsx` + module.css + test
- `useTodayLine.ts`
- `quick-setup-line.ts` + test
- `quick-setup-line.tsx`

Changed:

- `tonight-state.ts` (chip text export)
- `TonightControl.tsx` (uses it; `defaultOpen`)
- `TimelineTonight.tsx`
- `useStaffTonight.ts` (summary and status fields)
- `AvailabilityPage.tsx`
- `QuickSetupForm.tsx`
- `RegularWeekPanel.tsx`
- `ChangeRegularWeekDrawer.tsx`
- `ScheduleEditorDrawer.tsx`
- `QuickSetupCard.tsx` (shared focus helper)
- `quick-setup-field-helpers.ts`
- catalogs ×3
- e2e: new `availability-phone-tonight.spec.ts`; deliberate updates where the first-paint count (≤ 9) or phone selectors change.

## D. Risks

- **First-paint count:** the line's link adds one control (PRD 4 records ≤ 9). `availability-setup-hierarchy.spec.ts` and the fold-budget spec pin the count; update them deliberately.
- **Phone specs that open Change regular week or the schedule editor at 375 px** now need to open a service line first. `availability-phone.spec.ts`'s drawer "Edit Dinner"/"Remove Dinner" hits are the Special-dates services editor, not the week form; verify.
- **`useStaffTonight` change** touches Timeline and Briefing. The change is additive fields only; their tests must stay green.
- **File sizes:** `TonightControl.tsx` (631) and `QuickSetupForm.tsx` (168) stay ≤ 800 lines. `AvailabilityPage.tsx` is already 862 lines on the base, over the limit before this run. This run adds only the mount (≤ 4 lines) and puts all new logic in new files; splitting the page is not this run's job and is seeded.
