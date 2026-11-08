---
stage: architect
run: feature:availability-setup-hierarchy
date: 2026-11-07
amended: 2026-11-08
assumptions:
  - "Unattended run: the skill's step 6 (present the trade-offs and revise on feedback) was not done; the Owner is not available. The four decisions that could have gone another way (section closure storage, Tonight grouping, Host gating of floor-plan pages, the table Section select) are listed with a recommendation under Decisions & alternatives. The Owner can veto at the architecture gate."
  - "Data model (brief: Owner 'Architect decides'): one additive nullable column, `date_rules.section_id`, and one pure expansion function; no new target kind, no engine change. UI-only on today's model was tested against PRD criterion 4 and rejected (a snapshot of table ids goes stale when a table moves sections, a wrong guest-facing result); recorded in ADR-032."
  - "ADR-032 carries `status: active` with `provisional: true` and the README index row says `provisional`. The task asked for `status: provisional`, but `tools/cli/src/commands/adr-structural.ts` `VALID_STATUSES` accepts only active, superseded, deprecated, so `status: provisional` fails the pre-commit `check-adr`. ADR-031 set the precedent. ADR-030's `amended_by:` is a single value and was left as written; ADR-032's `amends: ADR-030` carries the link."
  - "Hub deep links: URL query parameters on `/availability` (`tab`, `closeSection`, `from`), parsed by one Zod schema and ignored when invalid. This overrides the UX document's 'in-app state where the page uses state' preference for the three hub deep links only, because router state does not survive a reload or a shared link; the tab stays page state after mount."
  - "`/setup` becomes the standing hub: the `DashboardLayout` bounce of an operational venue from exactly `/setup` and `SetupPage`'s own redirect are removed. Unready venues are still sent to `/setup` from `/timeline`, `/reservations`, `/guests`. `/setup/hours` keeps its redirect to `/availability`."
  - "Tonight grouping by floor-plan section is taken (UX's preference). The free-text `Table.location` stays in the data and on the table form, and is dropped from Tonight's list; no schema change and no mapping between location text and sections. A venue whose locations and sections disagree sees sections, plus a 'No section' group."
  - "Table Section select: built (a field on the existing table details form, using the existing table update). `Add section` (custom section names) is not built. The Select resolves the 'No section' dead end; criteria 1 and 4 and walkthrough W1 do not need custom names because room templates create sections. Tension with the PRD's 'no new editor for any resource type' is logged under Decisions & alternatives; the Owner can veto."
  - "Criterion 10 (Hosts see no editor) is met in the UI, not the API: a `RequireManager` route guard sends non-managers from `/floor-plans` and `/floor-plans/:id` to `/setup`, and the hub renders no action for a non-manager. Floor-plan and section API routes stay `requireAuth` only (no role change, per the PRD). This removes an access Hosts accidentally have today and drops the UX document's Host 'View floor plan' link, because no read-only floor-plan page exists; flagged for the Owner."
  - "Delivery shape: the slices under Components are independently mergeable off `main` with the dependency edges stated there; ordering is Decompose's."
  - "Dead `OperatingHoursStep` (PRD criterion 13): deleted with its test. `validateOperatingHours` is used only by a localisation test and a mock, so it goes too; the `OperatingHoursValidationErrors` type moves to `quick-setup-draft.ts`, its three importers follow."
  - "No independent architecture review subagent: the skill does not require one. Claims about the code were read in this worktree on 2026-11-07 (`origin/main` @ `7c051456f`)."
  - "Amendment 2026-11-08 (PRD criteria 14-24, ux.md W10-W22, S-Avail2): presentation, entry points and wording only. No API, schema, engine or data change; no new dependency. The Owner delegated the run ('keep working … make the ux easy for them'), so the step-6 trade-off review is recorded under Decisions with recommendations, not asked live; the Owner can veto at the architecture gate."
  - "Amendment: the 'Add a schedule…' seed fills the regular week's days only once a Starting date is set and while the days are untouched. Seeding days immediately would save, with no dates, an undated assignment that outranks the regular week on every day (`ScheduleEditorDrawer.tsx:86-88`); this narrows ux.md's 'seeded … and its days' and ux.md is corrected in the same commit."
  - "Amendment: no ADR. Every amendment decision is a two-way door undone by a revert with no data consequence; the reversal of 'Starting required, no default' (availability-config-usability ux.md:200) is a product decision flagged for the Owner in prd.md criterion 17, not an architectural one."
---

# Architecture: Availability setup hierarchy

Builds on `prd.md` and `ux.md` (commit `0c96bbb0e`). Amends ADR-030 through ADR-032 (provisional); contradicts neither ADR-029 nor ADR-031.

**Amendment (2026-11-08).** Adds the components under "Amendment components" below; every earlier component stands. Builds on `prd.md` criteria 14-24 and `ux.md` (commit `6c2b59a68`).

## Approach

Two shapes were compared. **A hub that owns editors** (a new Venue Setup area with its own forms) fails PRD criterion 2 and rebuilds what exists. **A read-composing hub that links to the existing editors** wins: `/setup` becomes a view over reads the app already makes (availability config, floor plans, sections, tables, booking rules), turned into a tree by one pure function, with every action a link to an existing editor or dialog. Every other change is a re-home or a rename: nav items and labels, the Schedules tab always shown, the Close dialog's "One section" choice, Tonight's grouping. The one thing that is not UI is "block a named section for a date": it needs a closure that stays true when a table moves between sections, so `DateRule` gains a nullable `sectionId` and one pure function expands it to table ids before the engine runs. The engine, its property test and the API's Zod config shapes change by one optional field only (ADR-032).

## Components

### Setup tree (policy)

- Responsibility: turn config, floor plans, sections, tables and booking settings into the hub's tree: nodes with kind, name, state (value, count or "not set up"), children and an action descriptor (target path or dialog, no JSX); the Host variant carries no actions. A pure module, `apps/hospitality/src/components/venue-setup/setup-tree.ts`, plus a loader-state type for per-group loading and errors. Owns criterion 1's nesting (venue → schedules → services; floor plan → sections → tables; special dates → their targets) and criterion 6's state.
- Collaborators: none at runtime (inputs are plain data). `@mbe/availability` for `RegularWeekLine`'s data, service names and the saved closures list.

### Venue Setup page (adapter)

- Responsibility: `/setup`. Calls the existing hooks (`useAvailabilityConfig`, `useFloorPlans`, `useFloorPlanSections`, `useTables`, the booking-rules read the drawer uses, `useVenueReadiness`), feeds the tree, renders it with Rialto components, and shows the Setup progress strip when readiness is `setup` and the viewer is a manager. Replaces `SetupPage`.
- Collaborators: Setup tree, `useIsManager`, router.
- Reads are independent queries, not one endpoint (see Interfaces: Hub reads).

### Viewer role (policy for gating)

- Responsibility: `useIsManager()` (extracted from the `team?.viewerRole === "manager"` check in `AvailabilityPage.tsx:415` and its copies) and `RequireManager` (a route guard modelled on `RequireAdmin`: non-managers go to `/setup`). One place says who may edit; the hub, the floor-plan routes and the new controls ask it.
- Collaborators: `useVenueTeam`, router.

### Navigation and route labels (adapter)

- Responsibility: `nav-sections.ts` and `DashboardLayout.tsx` `ROUTE_LABEL_KEYS`: one item "Venue Setup" (`/setup`) in both readiness states (pre-launch with the progress count), "Availability" kept, the pre-launch step items and the "Floor Plans" item removed; route labels per the UX glossary (`floor-plans` → "Floor Plan", `hours` → "Availability" for the redirect flash). The readiness redirect keeps unready venues off operational pages and stops bouncing operational venues from `/setup`.
- Collaborators: `useVenueReadiness`, i18n catalogs.

### Availability entry contract (adapter)

- Responsibility: `parseAvailabilityEntry(search)` (Zod) turns `?tab=`, `?closeSection=` and `?from=setup` into the page's initial tab, an initial Close dialog draft and a back-link flag; `AvailabilityPage` reads it once on mount and then removes `closeSection` from the URL with `replace`. Invalid values are ignored (never a 404 or an error). `AvailabilityScheduleControls` always shows the Schedules tab to a manager (drops the `hasOwnSchedules` gate at line 37) and hosts "Create another schedule…" on that tab.
- Collaborators: `AvailabilityPage`, Close dialog, Setup tree (builds the links through `availabilityPath(entry)` so no caller hand-writes a query string).

### Section closure (policy + adapters)

- Responsibility: "block a named section for a date" end to end (ADR-032).
  - Policy: `expandSectionRules(rules, membership)` in `@mbe/availability`; `ResolvedClosure` and the day summary closure carry optional `sectionId`; `validateConfig` rejects `sectionId` on a rule that is not `kind: closure` with `targetKind: tables`.
  - Types: `DateRuleBase` in `packages/types/src/schemas/availability-config.ts` gains `sectionId: IdSchema.nullish()`; the day summary closure schema gains an optional `sectionId` (absent from an older API during a deploy window, as `venueServiceId` already is).
  - Server adapter: `availability-snapshot.ts` `dateRuleCandidate` builds `tableIds` through the expansion (membership from one `table.findMany({ where: { venueId, sectionId: { not: null } } })`); `availability-config-rows.ts` writes `sectionId` and skips `DateRuleTable` rows for a section rule; `availability-config-plan.ts` `referenceIssues` checks `sectionId` is one of the venue's sections; the plan's changed-row compare treats `tableIds` as derived when `sectionId` is set; `floorPlanSectionService.delete` materialises live section closures before deleting.
  - Client adapter: `close-draft.ts` gains `{ kind: "section", sectionId }` among the "What" choices and emits `{ targetKind: "tables", sectionId, tableIds }` with `tableIds` from the client's table list through the same expansion function; `CloseStepOne.tsx`, `closure-band.ts`, the day drawer, `SpecialDatesTab.tsx` and the hub's Special dates node name the section from `sectionId`.
- Collaborators: engine (unchanged), config store, closure command plan (reads expanded `tableIds`, so "bookings affected" works unchanged), `assert-bookable.ts` (reads expanded `tableIds`).

### Tonight grouping (adapter)

- Responsibility: `TonightControl.tsx` groups its block-tables list by `Table.sectionId` and the section's name (plus "No section"); picked tables are still sent as `tableIds` through `block_tables`. The free-text `location` label leaves this list. A section choice here is a snapshot of table ids, which is right for a rule that expires at the end of the service day.
- Collaborators: `useTables`, `useFloorPlanSections`.

### Table section field (adapter)

- Responsibility: a `Section` select (the table's floor plan's sections plus "No section") on `TableDetailsForm.tsx`, saved through the existing table update (`useUpdateTable`, `sectionId` already on `TableSchema`); hidden for non-managers. The hub's "No section" group links to the floor plan.
- Collaborators: `useFloorPlanSections`, the table update route.

### Removal of the dead onboarding hours step

- Responsibility: delete `venue-onboarding/OperatingHoursStep.tsx` and its test; move `OperatingHoursValidationErrors` into `components/availability/quick-setup-draft.ts`; repoint `QuickSetupHoursStep.tsx`, `useOnboardingWizard.ts`; delete the `onboarding-localization.test.tsx` cases and the `staff-pages-localization.test.tsx` mock that name it; reword the `journey-recorder.ts` comment.
- Collaborators: none new.

### Independently mergeable slices (dependency edges only)

Each is a PR off `main` that keeps the suites green on its own. Ordering and sizing are Decompose's.

1. Viewer role: `useIsManager`, `RequireManager`, floor-plan routes guarded (no dependency).
2. OperatingHoursStep removal (no dependency).
3. Section closure, server and engine: migration, types, expansion, snapshot/rows/plan, section-delete materialisation, API tests (no dependency).
4. Close dialog "One section" and section naming in calendar, drawer and Special dates (needs 3).
5. Availability entry contract and the always-shown Schedules tab (no dependency).
6. Table Section select (no dependency).
7. Tonight grouping by section (no dependency).
8. Venue Setup hub and the standing `/setup` (needs 1, 5; uses 3 and 4 for the section action and closure rows; hides those parts if absent).
9. Navigation, route labels, glossary strings and the retired terms, in three locales (needs 8).


### Amendment components (2026-11-08)

#### Service hours text (policy)

- Responsibility: one formatter for a configured service's times, `serviceHoursText({ opensAt, lastSeatingAt, closesAt }, { t, format })` → "11:30 AM–3:00 PM, last seating 2:00 PM" (", last seating …" left out when it equals close), and `serviceCloseChangeText(days, { closesAt, lastSeatingAt })` for per-day differences ("Fri, Sat until 12:00 AM, last seating 11:00 PM"). New module `apps/hospitality/src/components/availability/service-hours.ts`, minutes through the existing `minuteText` (past-midnight aware). Owns PRD 16.
- Consumers switched to it: `RegularWeekLine.tsx` (the `hours`/`closes` keys), `venue-setup/useSetupNodeText.ts` (service rows and changes), `day-summary.ts` service text (`:70-74`), `AvailabilityDayEditor.tsx` service rows (`:377-380`). `setup-tree.ts` service values gain `closesAt` and its change filter compares `closesAt` too, so a per-day set that only moves the close is now shown.
- Collaborators: i18n (`availability.serviceHours.*` in three catalogs; retired keys removed).

#### Regular week edit (policy + two frames)

- Responsibility: `useRegularWeekEdit({ venueId, state, today, onStale, fixedStart?, initialDraft? })`, extracted from `ChangeRegularWeekDrawer.tsx:65-213` without changing its behaviour: the draft (`draftFromConfig`), edited weekday, `startsOn`/`endsOn`/name/winner/`conflictMode`, `useConflictReview`, `useScheduleSave`, the derived values (covered weekdays, dates of use, own changes, overlaps, issues, outside schedules, closed days, save block and its text, preview changes) and `submit()` with undo. `fixedStart` pins `startsOn` (and keeps it out of `dirty`); `initialDraft` replaces the saved week as the starting draft.
- Frames: `ChangeRegularWeekDrawer` = the hook + today's drawer chrome, gaining an `initialDraft` prop (Starting later…). New `RegularWeekPanel` = the hook with `fixedStart = today` + `QuickSetupForm` without `inDrawer` (the guest-preview column, as onboarding and quick setup) + the drawer's captions, `OwnChangesChoice`, `SaveFailure`/`ConflictReviewPanel`, `DraftPreview` + the footer (apply line, Starting later…, Discard, Save) + `ScheduleDraftGuard`/`LeaveGuard`. After its own save lands, the panel re-seeds from the refreshed config once `state.version` reaches the saved version; a colleague's save while dirty goes through conflict review as in the drawer, never a silent re-seed.
- Owns PRD 14 (with the page frame), 17. Collaborators: `QuickSetupForm`, `schedule-changes.ts`, `DraftPreview`, `ScheduleFormParts`.

#### Schedules layer (adapter)

- Responsibility: `SchedulesTab` becomes the layer S-Avail2 draws: heading "Regular week" with **Add a schedule…**; `RegularWeekPanel`; **Other schedules** (today's rows for non-regular schedules: Edit, Duplicate, Delete); the Booking line (booking-rules read + the hub's booking summary text); Compare services below. The editor target (`{ mode, sourceId }`) and `comparing` move up to the page as controlled props, so the header ⋯ can open Compare services and Duplicate regular week. The week panel's dirty state joins Compare's in the page's tab guard.
- Owns PRD 19 (with the page frame). Collaborators: Regular week edit, `ScheduleEditorDrawer`, `CompareServices`.

#### Availability page frame (adapter)

- Responsibility: `AvailabilityPage` renders one frame for every layer instead of three early returns (`:462-503`): page header with `AvailabilityHeaderActions` (Close…, Pause online booking, ⋯ = Booking rules…, Compare services, Duplicate regular week…, History, Go to date; phone: Close… and ⋯ with Pause first), `OnlinePausedBanner`, the load-failure banner, the layer control, the layer body, and the dialogs those actions open (`CloseDialog`, `BookingRulesDrawer`, `AvailabilityHistoryDrawer`, `GoToDateDialog`, `ChangeRegularWeekDrawer`, `ScheduleEditorDrawer`). Go to date from another layer switches to Calendar first; Compare services switches to Schedules.
- Default layer: `chosenTab` starts as `entry.tab ?? null`; the shown tab is `chosenTab ?? (access.isPending ? "pending" : access.isManager ? "schedules" : "calendar")`; `"pending"` renders the layer skeleton, never the calendar. The Host clamp (`:303`) stays. Quick setup's save stops moving focus to the calendar (`:264-272`); focus goes to the Regular week heading.
- `AvailabilityScheduleControls`: segment order Schedules, Calendar, Special dates; the Change regular week… button goes. `AvailabilityToolbar`: loses `onHistory`, `onGoToDate`, `onBookingRules`, `onClose`, `onPause`, `onChangeRegularWeek`; the phone menu holds only `selectItems` and is labelled "Select…". Calendar-only rows (week summary, Services filter, venue time, holiday nudge, regular-week line) render inside the Calendar layer.
- Owns PRD 14, 15, 21, 22, 23. Collaborators: `useManagerAccess`, entry contract, every layer.

#### Entry contract and hub links (adapter, amended)

- `AvailabilityEntry` gains `action?: "addSchedule"` (`?action=addSchedule`, Zod enum, ignored when invalid, removed from the URL after it is read like `closeSection`). Hub actions: `changeRegularWeek` becomes a link `availabilityPath({ tab: "schedules", from: "setup" })` (the hub's `ChangeRegularWeekDrawer` dialog goes); `createSchedule` is relabelled "Add a schedule…" and links `availabilityPath({ tab: "schedules", action: "addSchedule", from: "setup" })`.
- Owns PRD 7 and 8 for the moved entries.

#### Add a schedule seed (policy)

- Responsibility: `ScheduleEditorDrawer` mode `"new"` gains `seed?: "regular"`: services from the regular week (`draftFromConfig(config, …, regularId)`) with `days: []`; when Starting is set and the days are untouched, days become the regular week's covered weekdays. A seeded schedule saved with no dates keeps empty days, so it can never become an undated assignment that outranks the regular week. Duplicate is unchanged.
- Owns ux.md W18 (PRD 18 S8).

#### Onboarding copy (adapter)

- `onboarding.hours.intro` and a new `onboarding.launch.changeLater` caption under the launch review's guest preview (`LaunchStep.tsx`), three catalogs. Owns PRD 20.

#### Scenario harness (test adapter)

- `e2e/helpers/close-mock.ts` (the stateful closure mock lifted from `availability-close.spec.ts:95-175`), `e2e/helpers/first-paint.ts` (counts actionable controls outside a named region), and one scenario spec per PRD 18 row on the fixtures ux.md names (F-one, F-bistro, F-dinner, F-close). Owns PRD 15, 18, 21, 23 evidence.

## Data model

One migration, `services/reservations/prisma/migrations/<timestamp>_add_date_rule_section/migration.sql`:

```prisma
model DateRule {
  // …
  /// Set on a section closure (`kind: closure`, `targetKind: tables`): its tables are the section's
  /// current tables, expanded before the engine runs (ADR-032). Null on every other rule.
  sectionId String?             @map("section_id")
  section   FloorPlanSection?   @relation(fields: [sectionId], references: [id], onDelete: SetNull)
  @@index([sectionId])
}
// FloorPlanSection gains `dateRules DateRule[]`.
```

`sectionId` replaces the schema comment "`sectionId` (P3) is deliberately absent": the comment is rewritten to say what the column is and is not (a label and live membership, not Phase 3's per-section rules).

Access patterns and consistency:

- **Write: close one section for a date or range.** One `DateRule` row (`closure`, `tables`, `sectionId`), no join rows. Must be true when the request returns: it goes through the existing config save, `expectedVersion` compare-and-set and the audit/undo log unchanged.
- **Read: the engine's config.** `readStoredConfig` and the snapshot loader expand `tableIds` from live membership on every read; the day's result is always consistent with the floor plan as saved. Settling lag: none (same database read).
- **Read: name a section closure on the calendar, drawer, Special dates and hub.** `sectionId` joined to the sections list the page already has; a missing section cannot occur for a live rule (section delete materialises, below).
- **Write: move a table between sections** (existing `PUT /:sectionId/tables`, `Table.sectionId`). No change; the next read of config sees the new membership.
- **Write: delete a section.** In one transaction `floorPlanSectionService.delete` finds the venue's live rules (`deletedAt` null, `endsOn` null or on/after today) with that `sectionId`, writes `DateRuleTable` rows for the section's current tables, sets `sectionId` null, then deletes the section. The rule becomes a plain tables closure ("Tables blocked") rather than reopening. If the plan-delete path removes sections by cascade, the implementer applies the same step there (Implement verifies which path hard-deletes sections, and covers it with a test).
- **Row-level security:** `date_rules` already has the venue policy (ADR-026); the new column inherits it. The FK is not venue-aware, so the config plan's `referenceIssues` check is the enforcement for "section belongs to this venue".
- **Migration and backfill:** additive nullable column, index, FK; no default, nothing dropped, never run against a real database by this run. The legacy migration and backfill emit rules with `sectionId` null, which is the correct shape for rules that are not section closures, so the backfill path is unchanged and the golden test `availability-migration.golden.test.ts` is the proof. Forward path is tested by a migration test that applies all migrations to a scratch database and inserts a section rule.

No change to `Table.location` (kept, editable, not used for grouping any more on Tonight), `FloorPlanSection`, the `Schedule` family or `DateRuleTable`.

## Interfaces & contracts

### Section expansion

- Input: `rules: readonly DateRule[]`, `membership: ReadonlyMap<sectionId, readonly tableId[]>`.
- Output: new rules (inputs not mutated); each rule with `sectionId` set has `tableIds` replaced by the section's tables (empty array if the section is unknown); every other rule is returned as it was. Idempotent.
- Failure modes: none thrown. An unknown section yields an empty `tableIds`, which the engine reads as blocking nothing; the config plan rejects such a rule on write, so it can only appear through a race with section delete, which the delete step removes by materialising.

### Availability config save (`PUT` config, existing)

- Input: the existing body, with `dateRules[].sectionId` optional. A section rule's `tableIds` is ignored and recomputed on read.
- Output: unchanged; the saved rule is returned with expanded `tableIds` and `sectionId`.
- Failure modes: unchanged RFC 7807 problems; new issue codes from `validateConfig` (section rule that is not a table closure) and `referenceIssues` (section not in the venue) arrive as the existing 400 validation problem. A client from before this change sends no `sectionId`, parses fine, and never sees a section rule as anything but a `tables` rule: it shows "Tables blocked" (accepted).

### Availability entry (route contract)

- Input: query on `/availability`: `tab` ∈ the `AvailabilityTab` values (`calendar`, `special`, `schedules`), `closeSection` = a section id, `from` = `setup`.
- Output: initial tab; if `closeSection` names a section the venue has, the Close dialog opens with "One section" preselected (the date is the Manager's choice); a back-link "Venue Setup" when `from=setup`. `closeSection` is removed from the URL on mount so a refresh does not reopen it.
- Failure modes: unknown or malformed values are ignored; an unknown section id opens the dialog with no preselection; no parameter changes the route's content for a Host (the Close dialog is not rendered for non-managers).

### Hub reads

- Input: the five existing hooks, each a separate react-query read.
- Output: a per-group state: `loading | error(retry) | ready`; the "When you're open" group needs config and booking rules, "Where guests sit" needs floor plans, sections and tables.
- Failure modes: a failed read fails only its group (per-group `Alert` with the existing `describeApiError` text and Retry); both groups failing falls back to the existing `ErrorRetryBanner`. Reads are idempotent and retried by react-query as elsewhere. No new endpoint: a composed endpoint would have one consumer and a second contract to version; the five reads already exist and cache with the rest of the app.

### Route and redirect contract

- `/setup` renders the hub for `loading`-resolved `setup` and `operational` statuses; `DashboardLayout` no longer navigates away from exactly `/setup`.
- `/setup/hours` → `/availability` (`main.tsx:367`), `/availability`, `/floor-plans`, `/floor-plans/:id` (the last two for managers; non-managers → `/setup`) keep resolving. `/` still goes to `/timeline` for an operational venue.
- An unready venue on `/timeline`, `/reservations`, `/guests` still goes to `/setup`.
- Failure modes: an unknown path still reaches `NotFoundPage`.

### Role gate

- Input: `useVenueTeam().viewerRole`.
- Output: `useIsManager()` boolean; while the team read is loading it returns false, so nothing editable flashes for a Host and a Manager sees controls appear once the read settles.
- Failure modes: a failed team read leaves the viewer a non-manager (view-only, fail closed). The API still authorises writes as it does today (floor-plan and section routes are `requireAuth` only); this change does not alter any API's authorisation.

## Stack & dependencies

- No new dependency, library or service. Zod, react-query, react-router, Rialto, Prisma, Vitest and Playwright as in the rest of the repo.
- No new package: the setup tree lives beside its page in `apps/hospitality`; the expansion function lives in `@mbe/availability` beside the rules it reads.
- i18n: new keys in the three catalogs (en-US, es-MX, fr-CA) under `setup.*`, `nav.*`, `layout.routes.*`, `availability.close.*`, `availability.tonight.*`; the key-parity test stays the gate (criterion 11). Retired terms come out of all three.
- Accessibility: disclosure rows as buttons with `aria-expanded` in nested lists (no `role="tree"`: the page navigates, it does not manage tree selection).

## Decisions & alternatives

- **Section closure = `tables` rule + nullable `sectionId`, expanded before the engine (ADR-032)** over a UI-only expansion to table ids — the snapshot stays true only until a table moves, then the calendar says "Bar closed" while a Bar table is bookable; naming the section would be guessed from a set of ids. Over a new engine target `section` — touches `slots`, `resolve-day`, `closure-overlap`, `validate-config`, the property test's generators and needs membership as an engine input, for what Phase 3 will model properly. Against the PRD criteria: criterion 4 (named, guest-facing) is met at one added column; criteria 12 holds because the engine and its property test do not change.
- **Tonight groups by `FloorPlanSection`** over keeping free-text `location` — one grouping on every surface is the point of the run, the data is already on `Table`, and no mapping between location text and sections is attempted (any guess is wrong somewhere). The cost is that a venue that typed locations and never made sections sees one "No section" group until it assigns sections; accepted, and the hub says so.
- **Query parameters for the three hub deep links** over router state or new nested routes — state does not survive a reload or a shared link; nested routes (`/availability/schedules`) change the route table and every e2e that asserts `/availability`. The tab remains page state after mount, so no behaviour inside the page changes.
- **`/setup` is a standing page; the readiness redirect only guards operational pages** over a new route for the hub — a new route would leave `/setup` meaning "checklist" and keep two names for one idea. The `#4982` carve-out (`/setup/*` subpages) is no longer needed for `/setup` and stays for any future subpage.
- **Hub composes existing reads on the client** over a hub endpoint — see Interfaces: Hub reads. Two reads that fail independently are better UX than one that fails whole.
- **Host gating in the UI with `RequireManager` on `/floor-plans*`; API unchanged** over deferring criterion 10 for floor-plan pages, and over server-side role enforcement — deferring leaves a page that shows editors to Hosts, which the criterion forbids; changing API authorisation is a role change the PRD puts out of scope. Cost recorded: Hosts lose an editor they reach by accident today, and have no read-only floor-plan page (the Timeline's floor view and the hub's tree are what they read); the UX document's Host "View floor plan" link is dropped. Residual: a Host calling the API directly can still write; separate hardening, not this run.
- **Table `Section` select built; `Add section` not** over building both or neither. Neither leaves "No section" with no exit and the hub's **Move to a section** link dead; both adds a custom-section editor no criterion needs. The select edits an attribute of an existing resource inside its existing editor; it is the smallest thing that makes UX W1/W3 coherent, and it sits against the PRD's "A new editor for any resource type": read as "no new editor surface", not "no new field". Recorded for the Owner.
- **Schedules tab always shown to a manager** (UX) over keeping the `hasOwnSchedules` gate — the gate is the reason a one-schedule venue never sees the schedule level (PRD criterion 1). Accepted behaviour change below.
- **Delete `OperatingHoursStep` and `validateOperatingHours`; move the error type** over leaving the file for its type export — the only live export is a type; keeping a file to host one type keeps the name "operating hours" alive in code (criterion 13).
- **No ADR for** the hub shape, the entry-point contract, the Host gate or Tonight grouping: each is a two-way door undone by a revert, with no data consequence, so they fail the protocol's ADR test. ADR-032 passes it (data door one-way once a section closure is saved; surprising without context; a real trade-off).
- **(Amendment) Inline week panel = the drawer's logic as a shared hook, two frames** over rendering a second editor inline (two save paths drift: the review found the inline sketch had already dropped `OwnChangesChoice`), and over auto-opening the drawer on the Schedules layer (keeps the date picker in front of every edit, the thing PRD 17 removes). Recommendation taken: shared hook.
- **(Amendment) Default layer resolved after the role read, skeleton while pending** over defaulting to Calendar and switching once the role is known (a Manager sees 12+ controls flash, then a jump; first-paint counts become timing-dependent) and over defaulting to Schedules for everyone (Hosts have no Schedules layer, PRD 22).
- **(Amendment) Seed days on Starting** over seeding days immediately (an undated assignment that outranks the regular week if saved without dates — a silent replacement of the week) and over no seed (W18 costs 11, over budget).
- **(Amendment) `?action=addSchedule`** over a hub link that lands on Schedules and leaves one more click (the hub action would no longer do what it says) and over router state (does not survive reload; the run's contract is query parameters).
- **(Amendment) Service hours formatter in `apps/hospitality`** over `@mbe/availability` — it is presentation and i18n; the engine package has no `t`.

### Accepted behaviour changes (old rule vs new rule, over the inputs where they differ)

| Input                                                                       | Today                                                                                  | After                                                                                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Operational venue opens exactly `/setup`                                    | redirected to `/timeline`                                                              | renders Venue Setup                                                                                                                |
| Venue with one schedule, Manager opens Availability                         | Schedules tab absent; "Create another schedule…" in the toolbar                        | Schedules tab present; the button is on the tab                                                                                    |
| Tonight "block tables" list, tables with free-text `location` and a section | grouped by `location`, rows "Name · location"                                          | grouped by section, rows show the name; a table with no section is under "No section"; its `location` text is no longer shown here |
| Host opens `/floor-plans` or `/floor-plans/:id`                             | reaches the editors                                                                    | redirected to `/setup`                                                                                                             |
| Manager opens Close dialog                                                  | "What": venue, one service, booking only                                               | adds "One section" (disabled with a reason when the venue has no sections)                                                         |
| A table moves into a section that has a saved closure                       | n/a (no section closures)                                                              | the table is blocked for the dates still ahead; moving out unblocks it. Reservations already on the table stay                     |
| Section with a live closure is deleted                                      | n/a                                                                                    | the closure continues as "Tables blocked" over the section's tables at deletion                                                    |
| Client built before this change loads a section closure                     | n/a                                                                                    | shows "Tables blocked" (a `tables` rule), never an error                                                                           |
| Nav labels                                                                  | "Get Started" (3 locked step items) before launch; "Floor Plans", "Availability" after | "Venue Setup" (+ progress count) in both states; "Availability" after launch; step items and "Floor Plans" gone                    |
| Settings → Venue "Operating hours" button                                   | label "Operating hours", goes to `/availability`                                       | label "Venue Setup", goes to `/setup`                                                                                              |
| (Amendment) Manager opens `/availability` on a venue with hours                    | Calendar layer, 12-15 controls                                                          | Schedules layer: the week panel with the saved week and the guest preview; 7 controls outside it                                     |
| (Amendment) Role read pending                                                       | Calendar painted (Host view) until the read answers                                    | Layer skeleton                                                                                                                       |
| (Amendment) Quick setup's save                                                      | swaps to the calendar grid, focus on a day                                             | swaps to the Schedules layer week panel, focus on "Regular week"                                                                     |
| (Amendment) Changing the regular week                                               | drawer; Save blocked until Starting is picked                                          | inline Save applies from today (same `buildRegularWeekChanges` payload as the drawer's Start today); Starting later… opens the drawer |
| (Amendment) Regular-week line, hub service rows, day summary: Lunch 11:30/2:00/3:00 | "Lunch 11:30 AM–2:00 PM" (open–last seating)                                           | "Lunch 11:30 AM–3:00 PM, last seating 2:00 PM"                                                                                       |
| (Amendment) Day editor service rows                                                 | "Lunch 11:30 AM – 3:00 PM"                                                             | "Lunch 11:30 AM–3:00 PM, last seating 2:00 PM"                                                                                       |
| (Amendment) A per-day set that only moves the close                                 | left out of the hub and the regular-week line                                          | shown ("Fri, Sat until 12:00 AM, last seating 11:00 PM")                                                                             |
| (Amendment) Close…, Pause online booking, History, Go to date, Booking rules…       | calendar toolbar only (phone: one More actions menu)                                   | page header on every layer (phone: Close… + ⋯); the Calendar's phone menu holds only Select… items                                   |
| (Amendment) Hub "Change regular week…" / "Create another schedule…"                 | drawer on `/setup` / link to the Schedules tab                                         | link to the Schedules layer / "Add a schedule…" opening the seeded editor there                                                      |
| (Amendment) New schedule seeded from the regular week                               | button "Start from your regular week", days cleared                                    | Add a schedule… seeds services; days follow the regular week once Starting is set                                                    |
| (Amendment) Paused banner                                                           | calendar branch only                                                                   | above the layer control on every layer                                                                                               |

### Requirement traceability

| PRD criterion                         | Owned by                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1 one surface shows types and nesting | Setup tree, Venue Setup page, Schedules tab always shown                                               |
| 2 one primary editor per type         | Setup tree (links only), Navigation, Availability entry contract, Removal of the dead onboarding step  |
| 3 setup scenario not slower           | no change to the quick-setup flow; Setup tree makes the first unset node the primary action pre-launch |
| 4 block a section for a date          | Section closure, Close dialog, ADR-032                                                                 |
| 5 one term per concept                | Navigation and route labels, i18n catalogs, glossary in `ux.md` as test fixture                        |
| 6 state visible                       | Setup tree                                                                                             |
| 7 no control lost                     | Availability entry contract, Tonight grouping (control kept), UX "Where each existing control lives"   |
| 8 old routes work                     | Route and redirect contract                                                                            |
| 9 demo runs                           | Venue Setup page + Section closure + hub reads                                                         |
| 10 hosts see no unusable editor       | Viewer role, hub Host variant, `RequireManager`; API unchanged (residual above)                        |
| 11 three locales                      | i18n catalogs                                                                                          |
| 12 no regressions                     | engine and its property test unchanged; entry-point-moved spec edits listed in each slice's PR body    |
| 13 dead step removed                  | Removal of the dead onboarding hours step                                                              |
| 14 same first layer                   | Page frame (default layer), Regular week edit (`RegularWeekPanel`), Schedules layer                    |
| 15 calm first paint                   | Page frame, header actions, Schedules layer; Scenario harness `first-paint.ts`                         |
| 16 one time range                     | Service hours text                                                                                     |
| 17 edit in place from today           | Regular week edit (`fixedStart`), `ChangeRegularWeekDrawer` `initialDraft`                             |
| 18 scenario budgets                   | Scenario harness; Add a schedule seed (S8); header actions (S5, S7, S9, S10)                           |
| 19 hierarchy in words                 | Schedules layer                                                                                        |
| 20 onboarding names                   | Onboarding copy                                                                                        |
| 21 night-of actions                   | `AvailabilityHeaderActions`                                                                            |
| 22 hosts                              | Page frame (Host default and clamp), header actions hidden for non-managers                           |
| 23 demo                               | Page frame + Regular week edit + Scenario harness                                                      |
| 24 locales and regressions            | i18n catalogs; deliberate spec edits listed per PR                                                     |

## ADRs

- [ADR-032](../../adr/ADR-032-section-closure-is-a-tables-rule-that-remembers-its-section.md) — A Section Closure Is a Tables Rule That Remembers Its Section (provisional: frontmatter `status: active` + `provisional: true`; index row says `provisional`).
