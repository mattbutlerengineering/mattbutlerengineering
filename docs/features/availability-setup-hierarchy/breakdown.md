---
stage: decompose
run: feature:availability-setup-hierarchy
date: 2026-11-07
amended: 2026-11-08
tracking-issue: 8472
assumptions:
  - "Unattended run: the skill's step 6 (present the cut for the Owner's review) was not done; the Owner is not available. Milestone boundaries and sizes are the decomposer's and can be vetoed at the breakdown gate."
  - "Tracker export (brief: Owner 'mirror breakdown items to issues, no ready label'): tracking issue #8472 (labels feature, tracking) and one issue per item (label feature), none labelled ready; each item issue body says `Part of #8472`."
  - "Item cut: the architecture's nine slices are kept one item each, in the order below; one tenth item (Setup hierarchy end-to-end scenarios) is added because PRD criteria 2, 3, 7 and 9 are cross-slice scripted e2e (editor count before/after, setup scenario, no-control-lost, the demo) that no single slice can own. This is a decomposition choice, not a design change."
  - "Delivery shape (brief default): Implement builds one branch and PR per item off `main`; each PR carries `Part of #8472` and merges once a reviewer pass returns no fail/flag verdict and `CI Gate` is green."
  - "Dependencies that the architecture marks soft (the hub 'uses 3 and 4 ... hides those parts if absent') are not hard blockers here, so the hub can merge before them; the end-to-end item is blocked by all of them."
  - "Reconciled 2026-11-08: items 1-9 are ticked because each merged to `main` (#8484, #8483, #8487, #8489, #8488, #8486, #8485, #8493, #8499) and its tracker issue closed as completed; the boxes had been left unticked on this branch."
  - "Amendment 2026-11-08 (Milestone 3): items drafted from architecture.md 'Amendment components' with no live cut review (the Owner delegated). Not mirrored to the tracker: the export instruction belonged to the 2026-11-07 autorun brief and #8472 is closed; the checkboxes are the state."
  - "Amendment delivery shape: the amendment is built on this run branch (`feat/availability-setup-hierarchy`, up to date with `main`), one commit per item, and ships with the run's artifacts in one pull request, because items 12-15 change the same page in sequence and the run's docs have never reached `main`."
  - "Item 10 (Setup hierarchy end-to-end scenarios, #8482) is built inside item 17's scenario suite: its checks (c) and (d) name controls the amendment moves (Change regular week…, the Schedules tab), so writing them against the old page first would be rewritten at once."
  - "The 'before' editor-count baseline for PRD criterion 2 is measured on `origin/main` @ `7c051456f` inside the end-to-end item, not recorded here."
---

# Breakdown: Availability setup hierarchy

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met. Tracking issue: #8472. Each item is one PR off
`main`, with its own RED tests first (TDD), and its PR body says
`Part of #8472`. "PRD" lists the criteria in `prd.md` the item covers; the
architecture's component names are kept as written in `architecture.md`.

## Milestone 1: Foundations: independent slices that keep the product working and unlock the rest (role gate, dead-step removal, section closure end to end on the server)

- [x] **Viewer role gate** — `useIsManager()` and `RequireManager`; guard `/floor-plans` and `/floor-plans/:id`; existing manager checks use the hook. (tracker: #8473)
  - Files: `apps/hospitality/src` (new `useIsManager` hook and `RequireManager` guard beside `RequireAdmin`; `AvailabilityPage.tsx` ~line 415 and its copies of `team?.viewerRole === "manager"`; route table in `main.tsx`); `apps/hospitality/e2e` floor-plan specs.
  - RED tests: Unit: `useIsManager` is false while the team read loads, false on a failed read, true for `viewerRole: manager`. Component: `RequireManager` redirects a non-manager to `/setup` and renders children for a manager. e2e: a Host opening `/floor-plans` and `/floor-plans/:id` lands on `/setup`; a Manager still reaches both (floor-plan specs updated only where a Host was assumed).
  - Accept: Host is redirected from `/floor-plans*` to `/setup`; Manager unaffected; every former inline `viewerRole === "manager"` check calls `useIsManager`; floor-plan API routes untouched; existing availability and floor-plan suites green.
  - Blocked by: —
  - PRD: 10 (route part), 12
- [x] **Remove the dead OperatingHoursStep** — Delete `venue-onboarding/OperatingHoursStep.tsx`, its test and `validateOperatingHours`; move `OperatingHoursValidationErrors` to `quick-setup-draft.ts`. (tracker: #8474)
  - Files: `apps/hospitality/src/components/venue-onboarding/OperatingHoursStep.tsx` and its test (delete); `components/availability/quick-setup-draft.ts` (receives the type); `QuickSetupHoursStep.tsx`, `useOnboardingWizard.ts` (repoint imports); `onboarding-localization.test.tsx` and `staff-pages-localization.test.tsx` (remove the cases and mock that name the step); `journey-recorder.ts` (reword the comment).
  - RED tests: Component (RED first): a test that asserts nothing under `apps/hospitality/src` imports `OperatingHoursStep` or `validateOperatingHours` (a grep-style guard test) and that the onboarding wizard hours step renders `QuickSetupHoursStep`. Existing onboarding component tests stay green.
  - Accept: `grep -r OperatingHoursStep apps/hospitality/src` returns nothing; `pnpm --filter hospitality typecheck` and the onboarding component tests pass; the wizard still renders `QuickSetupHoursStep`.
  - Blocked by: —
  - PRD: 2 (wizard step drops), 12, 13
- [x] **Section closure: migration, engine expansion and server** — ADR-032: `date_rules.section_id`, `expandSectionRules`, types, snapshot/rows/plan adapters and section-delete materialisation. (tracker: #8475)
  - Files: `services/reservations/prisma/schema.prisma` (`DateRule.sectionId` + relation + index; `FloorPlanSection.dateRules`; rewrite the "`sectionId` (P3) is deliberately absent" comment); new folder `services/reservations/prisma/migrations/<timestamp>_add_date_rule_section/migration.sql` (additive nullable column, index, FK `ON DELETE SET NULL`; no default, nothing dropped); `packages/availability` (`expandSectionRules`, `ResolvedClosure` and day-summary closure carry optional `sectionId`, `validateConfig` rejects `sectionId` on anything but `kind: closure` + `targetKind: tables`); `packages/types/src/schemas/availability-config.ts` (`DateRuleBase.sectionId: IdSchema.nullish()`, day-summary closure optional `sectionId`); `services/reservations` `availability-snapshot.ts`, `availability-config-rows.ts`, `availability-config-plan.ts`, `floorPlanSectionService.delete`.
  - RED tests: Unit (`packages/availability`): `expandSectionRules` replaces `tableIds` from membership, returns empty for an unknown section, leaves other rules as is, does not mutate, is idempotent; `validateConfig` rejects `sectionId` on a non-table-closure rule. Service: config save with a section rule writes `sectionId` and no `DateRuleTable` rows; `referenceIssues` rejects a section from another venue; changed-row compare treats `tableIds` as derived; snapshot expansion makes a table moved into the section blocked and one moved out bookable (guest-facing result via `assert-bookable`); deleting a section with a live closure materialises `DateRuleTable` rows, nulls `sectionId` and keeps the closure as a plain tables closure; an expired closure is not materialised. Migration test: all migrations apply to a scratch database and a section rule inserts. `availability-migration.golden.test.ts` unchanged and green (backfill emits `sectionId` null).
  - Accept: Migration folder exists, applies forward on a scratch database in the test, and is never run against a real database; legacy migration/backfill path yields rules with `sectionId` null (golden test green); engine and its property test unchanged and green; guest-facing availability for a section closure follows live membership. Implement MUST verify whether deleting a floor plan (or the plan-delete path) hard-deletes sections by cascade; if it does, apply the same materialisation step there and cover it with a test, otherwise record the verified path in the PR body. Dedicated migration PR body states: additive, nullable, no backfill needed.
  - Blocked by: —
  - PRD: 4 (mechanism and guest-facing result), 12

## Milestone 2: Section-aware editors: a Manager can block a named section, deep-link into Availability, assign tables to sections and see Tonight grouped by section

- [x] **Close dialog: One section choice and section naming** — Add `{ kind: "section", sectionId }` to the Close dialog's "What" choices and name a section closure by section on the calendar, day drawer and Special dates. (tracker: #8476)
  - Files: `apps/hospitality/src/components/availability` `close-draft.ts`, `CloseStepOne.tsx`, `closure-band.ts`, the day drawer, `SpecialDatesTab.tsx`; i18n catalogs `availability.close.*`.
  - RED tests: Unit: `close-draft` emits `{ targetKind: "tables", sectionId, tableIds }` with `tableIds` from the client table list through `expandSectionRules`. Component: "One section" lists the venue's sections, is disabled with a reason when there are none; calendar band, drawer and Special dates show the section name, not a table list; a `tables` rule with no `sectionId` still reads "Tables blocked". e2e: Manager closes one named section for one date and the date shows the section name. New copy in en-US, es-MX and fr-CA; the i18n key-parity test passes.
  - Accept: A Manager blocks one named section for one date from the Close dialog and every surface shows the section by name; the bookings-affected count uses expanded `tableIds` unchanged; existing close-dialog specs green.
  - Blocked by: Section closure: migration, engine expansion and server
  - PRD: 4, 11, 12
- [x] **Availability entry contract and always-shown Schedules tab** — `parseAvailabilityEntry` / `availabilityPath(entry)` for `?tab=`, `?closeSection=`, `?from=setup`; the Schedules tab always shows to a manager. (tracker: #8477)
  - Files: `apps/hospitality/src/components/availability` (new `parseAvailabilityEntry`, `availabilityPath`), `AvailabilityPage.tsx` (read once on mount, then remove `closeSection` with `replace`; back-link "Venue Setup" when `from=setup`), `AvailabilityScheduleControls.tsx:37` (drop the `hasOwnSchedules` gate; "Create another schedule…" moves onto the Schedules tab), `availability-*.spec.ts` where the toolbar button moved; i18n `availability.*`.
  - RED tests: Unit: Zod parse accepts valid `tab`, `closeSection`, `from`; ignores invalid and unknown values; `availabilityPath` round-trips. Component: a one-schedule venue shows the Schedules tab to a Manager and not to a Host; `closeSection` opens the Close dialog (needs the Close dialog item when present; before it lands the param is parsed and removed, dialog preselection is covered once that item is merged); `from=setup` shows the back-link; the param is removed from the URL after mount. e2e: `/availability?tab=schedules` opens Schedules; garbage params render the default page. New copy in en-US, es-MX and fr-CA; the i18n key-parity test passes.
  - Accept: Deep links work and never error; a one-schedule venue sees the schedule level; no route changes; existing availability e2e green, edits limited to the moved "Create another schedule…" entry and listed in the PR body.
  - Blocked by: —
  - PRD: 1 (schedule level), 7, 8, 11, 12
- [x] **Table Section select** — A `Section` select (the floor plan's sections plus "No section") on `TableDetailsForm.tsx`, saved through the existing table update; hidden for non-managers. (tracker: #8478)
  - Files: `apps/hospitality/src/components/floor-plan/TableDetailsForm.tsx` (and its hooks: `useFloorPlanSections`, `useUpdateTable`); i18n `floorPlan.*`.
  - RED tests: Component: the select lists the table's floor plan's sections and "No section"; changing it calls the table update with `sectionId` (null for none); hidden for a non-manager. e2e (floor-plan spec): assign a table to a section and see it persisted. New copy in en-US, es-MX and fr-CA; the i18n key-parity test passes.
  - Accept: A Manager moves a table into and out of a section from the table form; no "Add section" control is built; existing floor-plan specs green.
  - Blocked by: —
  - PRD: 4 (needs sections populated), 9, 11, 12
- [x] **Tonight grouping by floor-plan section** — `TonightControl.tsx` groups the block-tables list by `Table.sectionId` and section name, plus "No section"; free-text `location` leaves the list. (tracker: #8479)
  - Files: `apps/hospitality/src/components/availability/TonightControl.tsx`; i18n `availability.tonight.*`.
  - RED tests: Component: tables group under their section name; a table with no section is under "No section"; rows show the table name only (no `location`); picking tables still sends `tableIds` via `block_tables`. Existing Tonight specs updated only for the grouping change, listed in the PR body. New copy in en-US, es-MX and fr-CA; the i18n key-parity test passes.
  - Accept: Tonight's block-tables list is grouped by section with a "No section" group; the `block_tables` payload is unchanged; `Table.location` stays in the data and on the table form.
  - Blocked by: —
  - PRD: 5, 7, 11, 12

## Milestone 3: One setup surface: the Venue Setup hub, the navigation that points at it, and the scenarios that prove the demo

- [x] **Venue Setup hub and standing /setup** — `setup-tree.ts` pure tree builder plus the Venue Setup page replacing `SetupPage`; `/setup` stops bouncing operational venues. (tracker: #8480)
  - Files: new `apps/hospitality/src/components/venue-setup/setup-tree.ts` and page adapter (replaces `apps/hospitality/src/pages/SetupPage.tsx`); `DashboardLayout.tsx` (remove the operational bounce from exactly `/setup`; unready venues still go to `/setup` from `/timeline`, `/reservations`, `/guests`); `main.tsx` (`/setup/hours` redirect kept); uses `useAvailabilityConfig`, `useFloorPlans`, `useFloorPlanSections`, `useTables`, the booking-rules read, `useVenueReadiness`, `useIsManager`, `availabilityPath`; i18n `setup.*`; `onboarding.spec.ts` and any spec asserting the `/setup` bounce (changed deliberately, listed in the PR body). Per-group loading/error with the existing `describeApiError` text and Retry; both failing falls back to `ErrorRetryBanner`. Disclosure rows are buttons with `aria-expanded` (no `role="tree"`). Section action and closure rows use the Close dialog / section closure data when merged and are hidden if absent.
  - RED tests: Unit (`setup-tree`): venue → schedules → services, floor plan → sections → tables, special dates → their targets; empty venue marks every node "not set up" with what it is; a one-schedule venue still has the schedule level; Host variant has no actions; first unset node is the primary action pre-launch. Component per resource type: node shows current value or count after the editor saves; per-group error/retry. e2e: empty fixture venue lists every criterion-1 type as not set up; node actions open the one primary editor; an operational venue stays on `/setup`; an unready venue is still bounced from `/timeline`; `/setup/hours` still lands on `/availability`; Host sees no editor, save or "set up" call to action. New copy in en-US, es-MX and fr-CA; the i18n key-parity test passes.
  - Accept: `/setup` renders the hub for setup and operational venues; every node in PRD criterion 1 is present with its nesting and state; every action links to an existing editor; Host variant has no editors; old routes resolve.
  - Blocked by: Viewer role gate; Availability entry contract and always-shown Schedules tab
  - PRD: 1, 2, 3 (first unset node), 6, 8, 9 (partial), 10, 11, 12
- [x] **Navigation, route labels and glossary terms** — One "Venue Setup" nav item (`/setup`) in both readiness states with the progress count; remove the pre-launch step items and "Floor Plans"; route labels per the UX glossary; retire old terms in three locales. (tracker: #8481)
  - Files: `nav-sections.ts`, `DashboardLayout.tsx` `ROUTE_LABEL_KEYS` (`floor-plans` → "Floor Plan", `hours` → "Availability"), Settings → Venue "Operating hours" button (label "Venue Setup", goes to `/setup`), i18n `nav.*`, `layout.routes.*` and removal of retired terms in en-US, es-MX, fr-CA; nav/onboarding/availability/floor-plan e2e specs where labels or entry points moved (listed in the PR body).
  - RED tests: Component: nav shows "Venue Setup" + progress count pre-launch and "Venue Setup" + "Availability" after launch, with no step items or "Floor Plans"; Host nav has no editor entry. Scripted glossary check (fixture = `ux.md` glossary): one label per resource type across nav items, page titles, hub labels, checklist steps and drawer titles, identical before and after launch for the same destination; retired terms absent from all three catalogs. e2e: Settings button lands on `/setup`. New copy in en-US, es-MX and fr-CA; the i18n key-parity test passes.
  - Accept: PRD criterion 5's scripted check passes; nav matches the architecture's Navigation component; key-parity test passes; existing specs green with only label/entry-point edits listed in the PR body.
  - Blocked by: Venue Setup hub and standing /setup
  - PRD: 2, 5, 8, 10, 11, 12
- [ ] **Setup hierarchy end-to-end scenarios** — Scripted e2e for the setup scenario, the editor-count table, no-control-lost and the demo, on one fixture venue. (tracker: #8482)
  - Files: new `apps/hospitality/e2e/availability-setup-hierarchy.spec.ts` (and fixture helpers beside the existing availability specs). The "before" editor counts are measured on `origin/main` @ `7c051456f` (a throwaway worktree run, numbers quoted in the PR body) and encoded as the expected pre-change values; the "after" count is asserted.
  - RED tests: e2e (RED against current behaviour for the after-counts): (a) editors-per-resource-type table, before vs after, "after" = 1 for every type in criterion 1; (b) empty venue: set a two-service varied week via quick setup in no more interactions than `availability-quick-setup.spec.ts` on `7c051456f`, then block one named section for one date; (c) each of Tonight, Compare services, History, Booking rules, Change regular week, Copy day, the Special dates tab and the guest-view strip is reachable by a Manager and performs its action; (d) the demo script from PRD criterion 9 end to end, including the section named on the hub's Special dates node and the guest-view strip result; (e) Host sees no editor on hub, nav or pages.
  - Accept: The new spec passes alongside existing availability, onboarding and floor-plan e2e; the interaction count for the varied week is quoted against the `7c051456f` baseline; the hand-timing bar (≤5 min) remains an Owner-only check, not claimed here.
  - Blocked by: Venue Setup hub and standing /setup; Navigation, route labels and glossary terms; Close dialog: One section choice and section naming; Table Section select; Tonight grouping by floor-plan section
  - PRD: 2, 3, 4, 7, 9, 10, 12

## Milestone 3: Calm, consistent Availability (amendment 2026-11-08): the week a Manager set up in onboarding is the first thing `/availability` shows, editable in place, with everything else one named layer down

- [x] **Service hours text** — One formatter, "11:30 AM–3:00 PM, last seating 2:00 PM", used by the regular-week line, the hub, the day summary and the day editor.
  - Files: new `apps/hospitality/src/components/availability/service-hours.ts` (+ test); `RegularWeekLine.tsx`, `day-summary.ts`, `AvailabilityDayEditor.tsx`, `venue-setup/useSetupNodeText.ts`, `venue-setup/setup-tree.ts` (service value gains `closesAt`; change filter compares it); three catalogs (`availability.serviceHours.*`, retired keys removed).
  - RED tests: Unit: `serviceHoursText` over a fixture with open 690, last seating 840, close 900 returns "11:30 AM–3:00 PM, last seating 2:00 PM"; last seating equal to close drops the clause; a past-midnight close (1440+) reads "12:00 AM"; `serviceCloseChangeText` names days, close and last seating. Component: `RegularWeekLine`, the hub service row, the day editor row and the day summary all render the identical string for the same service. Unit: `setup-tree` shows a per-day set that only moves the close.
  - Accept: the four surfaces print the same range for the same service and day (PRD 16); key parity test green; existing RegularWeekLine/setup-tree/day-drawer tests updated only for the new wording.
  - Blocked by: —
  - PRD: 16, 24

- [x] **Regular week edit hook** — Extract `useRegularWeekEdit` from `ChangeRegularWeekDrawer` with `fixedStart` and `initialDraft`; the drawer becomes hook + chrome and gains an `initialDraft` prop.
  - Files: new `components/availability/use-regular-week-edit.ts` (+ test); `ChangeRegularWeekDrawer.tsx`.
  - RED tests: Unit (hook): with `fixedStart = today` the save block never reports `startRequired`, `dirty` ignores the start, and `submit()` sends the same `buildRegularWeekChanges` payload and conflict mode as the drawer with Starting = today; `initialDraft` replaces the saved week as the draft and counts as dirty when it differs. Component: the drawer opened with `initialDraft` shows those rows with Starting empty.
  - Accept: every existing `ChangeRegularWeekDrawer` test and `availability-regular-week.spec.ts` stay green unchanged; the hook payload test proves inline and drawer saves are byte-identical for the same draft and start.
  - Blocked by: —
  - PRD: 17

- [x] **Week panel on the Schedules layer** — `RegularWeekPanel` (week form with guest preview, captions, own-changes choice, stranded preview, footer with Starting later…, Discard, Save, discard guards) and the Schedules layer around it (Regular week heading, Add a schedule…, Other schedules, Booking line, Compare below).
  - Files: new `components/availability/RegularWeekPanel.tsx` (+ test, CSS module); `SchedulesTab.tsx` (+ test, CSS); three catalogs.
  - RED tests: Component: the panel shows the saved services, times, days and the guest preview; the footer reads "Changes apply from today, {date}." and offers Starting later… before any edit; an edit adds Discard and Save and the drawer's captions; Save calls the hook's submit and the form re-seeds from the refreshed config; Starting later… calls back with the current draft; with covered own changes the own-changes choice renders. Component: the layer lists only non-regular schedules under Other schedules with Edit, Duplicate, Delete; the heading reads "Regular week"; the Booking line renders the booking summary; Compare opens when the page says so.
  - Accept: a Manager can change the regular week on the layer without a drawer and without picking a date (PRD 17); the hierarchy reads Regular week → its services, siblings listed (PRD 19).
  - Blocked by: Regular week edit hook
  - PRD: 14, 17, 19

- [x] **Availability page frame** — One frame for every layer: header actions (Close…, Pause online booking, ⋯), paused banner, layer control Schedules | Calendar | Special dates, Manager default Schedules after the role read with a skeleton while pending, shared dialogs; calendar toolbar trimmed; quick-setup save lands on the week panel.
  - Files: `pages/AvailabilityPage.tsx` (+ test), new `components/availability/AvailabilityHeaderActions.tsx` (+ test), `AvailabilityScheduleControls.tsx` (+ test), `AvailabilityToolbar.tsx` (+ test), `AvailabilityQuickSetup.tsx` focus; three catalogs.
  - RED tests: Component: role pending renders the skeleton and no calendar; a Manager lands on Schedules, a Host on Calendar with no Schedules layer and no header actions; `?tab=calendar` opens Calendar; header Close…, Pause, Booking rules…, History, Go to date (switches to Calendar) and Compare services (switches to Schedules) work from every layer; the paused banner shows on every layer; the toolbar no longer renders ⋯, Close…, Pause or Change regular week…; the phone toolbar menu holds only Select… items. Leaving Schedules with a dirty week panel asks first.
  - Accept: first paint on the one-schedule fixture shows 7 actionable controls outside the week panel (PRD 15); night-of actions are one interaction on desktop, two on phone (PRD 21); Hosts see today's page (PRD 22).
  - Blocked by: Week panel on the Schedules layer
  - PRD: 14, 15, 21, 22

- [x] **Add a schedule seed and hub links** — `ScheduleEditorDrawer` new-mode seed from the regular week (days follow it once Starting is set and untouched); `?action=addSchedule`; hub Change regular week → `?tab=schedules`, hub "Add a schedule…" → `?tab=schedules&action=addSchedule`; "New schedule"/"Create another schedule…" retire.
  - Files: `ScheduleEditorDrawer.tsx` (+ test), `availability-entry.ts` (+ test), `venue-setup/setup-tree.ts` (+ test), `pages/SetupPage.tsx` (drops the regular-week dialog), `SchedulesTab.tsx`, `AvailabilityPage.tsx` (reads `action` once, then removes it), three catalogs.
  - RED tests: Component: the seeded editor opens with the regular week's services and no days; setting Starting fills the days from the regular week; touching days first stops the fill; saving with no dates keeps empty days. Unit: `parseAvailabilityEntry` accepts `action=addSchedule`, drops anything else; `availabilityPath` round-trips it. Unit: hub actions are links with those paths. e2e: the hub's Add a schedule… opens the seeded editor on the Schedules layer.
  - Accept: no path saves a dateless schedule with days from the seed; hub actions do what they say on the Schedules layer (PRD 7, 8).
  - Blocked by: Availability page frame
  - PRD: 7, 8, 18 (S8), 19

- [x] **Onboarding copy** — Hours step intro names where the week lives later; launch review caption under the guest preview.
  - Files: `src/i18n/catalogs/{en-US,es-MX,fr-CA}.json` (`onboarding.hours.intro`, new `onboarding.launch.changeLater`), `components/venue-onboarding/LaunchStep.tsx` (+ test), `QuickSetupHoursStep` test if it pins the intro.
  - RED tests: Component: the hours step shows "Your services and the days they run. Change it any time in Availability → Schedules."; the launch review shows "Change these later in Availability → Schedules." under the guest preview.
  - Accept: onboarding uses the glossary term and names the place (PRD 20); key parity green.
  - Blocked by: —
  - PRD: 20, 24

- [ ] **Scenario suite, first paint and the demo** — Close mock and first-paint helpers; one e2e per PRD 18 scenario on the ux.md fixtures; first-paint count; night-of reachability desktop and phone; the demo; item 10's checks (a)-(e) updated for the layered page; deliberate updates to the specs the amendment moves.
  - Files: new `e2e/helpers/close-mock.ts`, `e2e/helpers/first-paint.ts`, `e2e/availability-scenarios.spec.ts`, `e2e/availability-setup-hierarchy.spec.ts`; updated `availability-interaction-baselines.spec.ts`, `availability-interaction-guards.spec.ts`, `availability-entry.spec.ts`, `availability-regular-week.spec.ts`, `availability-phone.spec.ts`, `availability-close.spec.ts` (uses the lifted mock), `venue-setup-hub.spec.ts`, `onboarding.spec.ts` where they assert moved entries.
  - RED tests: e2e: S1-S10 each end saved within budget (interaction counter), the with-bookings variants of S5/S7 recorded with their counts; first paint ≤ 7 outside the week panel; Close… and Pause one interaction on desktop, two at 375×812; the demo script of PRD 23; W10 (quick setup → reload → the same week panel); Host page unchanged; item 10 (a)-(e).
  - Accept: all new and updated specs pass with the full availability, onboarding and Venue Setup suites; every changed expectation is listed in the PR body; the measured counts are quoted.
  - Blocked by: Service hours text; Availability page frame; Add a schedule seed and hub links; Onboarding copy
  - PRD: 2, 3, 7, 9, 10, 12, 14, 15, 18, 21, 22, 23, 24

## Design gaps found

None.

## Notes

- Verification the architecture left to Implement: whether deleting a floor plan (the plan-delete path) hard-deletes sections by cascade. It is carried in the item "Section closure: migration, engine expansion and server".
- Entry-point spec edits (`availability-*.spec.ts`, `onboarding.spec.ts`, floor-plan specs, and any spec asserting the old `/setup` bounce) belong to the item that moves the entry point and are listed in that PR's body.
- 2026-11-08 (Implement, Milestone 3): deviations and findings, each verified by the item's tests and the full hospitality unit suite (410 files, 5678 tests green).
  - Service hours text: a past-midnight close reads "12:00 AM (next day)", the existing `minuteText` convention, not ux.md's shorthand "12:00 AM". `regular-week-line.ts` also gained `closesAt` (the line reads it). The calendar cells use the same formatter through `day-summary.ts`, so they now print open–close plus last seating too.
  - Regular week edit hook: `onSaved` receives the save result (the panel waits for that version before re-seeding); an extra `onGone` carries the conflict review's "the regular week is gone" path.
  - Week panel: `ChangeRegularWeekDrawer` (Starting later…) is rendered by `SchedulesTab`, `ScheduleEditorDrawer` by the page; the booking summary is one function, `bookingRulesText`, shared with the hub. The inline stranded preview is titled "What changes for guests" (`DraftPreview` `title`), because the form's guest-preview column already says "Guest preview".
  - Page frame: Hosts keep History and Go to date in a header ⋯ (PRD 7 and 22; the first cut dropped them). The hub's Open calendar now links `?tab=calendar` because a Manager's default layer is Schedules.
  - Add a schedule seed: with no dates, Save stays blocked on "Choose at least one day", so a dateless schedule with seeded days cannot be saved; "Start from your regular week" retires.
  - Scenario suite findings fixed in the product, not in the budgets: the Close dialog's To picker opened on today's month (Rialto `Calendar` now opens on `min`'s month when there is no value; To is bounded by From), and moving From past To left an inverted range (To now follows From). Both were S7 (a week-long vacation) over budget.

