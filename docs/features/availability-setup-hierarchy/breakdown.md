---
stage: decompose
run: feature:availability-setup-hierarchy
date: 2026-11-07
tracking-issue: 8472
assumptions:
  - "Unattended run: the skill's step 6 (present the cut for the Owner's review) was not done; the Owner is not available. Milestone boundaries and sizes are the decomposer's and can be vetoed at the breakdown gate."
  - "Tracker export (brief: Owner 'mirror breakdown items to issues, no ready label'): tracking issue #8472 (labels feature, tracking) and one issue per item (label feature), none labelled ready; each item issue body says `Part of #8472`."
  - "Item cut: the architecture's nine slices are kept one item each, in the order below; one tenth item (Setup hierarchy end-to-end scenarios) is added because PRD criteria 2, 3, 7 and 9 are cross-slice scripted e2e (editor count before/after, setup scenario, no-control-lost, the demo) that no single slice can own. This is a decomposition choice, not a design change."
  - "Delivery shape (brief default): Implement builds one branch and PR per item off `main`; each PR carries `Part of #8472` and merges once a reviewer pass returns no fail/flag verdict and `CI Gate` is green."
  - "Dependencies that the architecture marks soft (the hub 'uses 3 and 4 ... hides those parts if absent') are not hard blockers here, so the hub can merge before them; the end-to-end item is blocked by all of them."
  - "The 'before' editor-count baseline for PRD criterion 2 is measured on `origin/main` @ `7c051456f` inside the end-to-end item, not recorded here."
---

# Breakdown: Availability setup hierarchy

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met. Tracking issue: #8472. Each item is one PR off
`main`, with its own RED tests first (TDD), and its PR body says
`Part of #8472`. "PRD" lists the criteria in `prd.md` the item covers; the
architecture's component names are kept as written in `architecture.md`.

## Milestone 1: Foundations: independent slices that keep the product working and unlock the rest (role gate, dead-step removal, section closure end to end on the server)

- [ ] **Viewer role gate** — `useIsManager()` and `RequireManager`; guard `/floor-plans` and `/floor-plans/:id`; existing manager checks use the hook. (tracker: #8473)
  - Files: `apps/hospitality/src` (new `useIsManager` hook and `RequireManager` guard beside `RequireAdmin`; `AvailabilityPage.tsx` ~line 415 and its copies of `team?.viewerRole === "manager"`; route table in `main.tsx`); `apps/hospitality/e2e` floor-plan specs.
  - RED tests: Unit: `useIsManager` is false while the team read loads, false on a failed read, true for `viewerRole: manager`. Component: `RequireManager` redirects a non-manager to `/setup` and renders children for a manager. e2e: a Host opening `/floor-plans` and `/floor-plans/:id` lands on `/setup`; a Manager still reaches both (floor-plan specs updated only where a Host was assumed).
  - Accept: Host is redirected from `/floor-plans*` to `/setup`; Manager unaffected; every former inline `viewerRole === "manager"` check calls `useIsManager`; floor-plan API routes untouched; existing availability and floor-plan suites green.
  - Blocked by: —
  - PRD: 10 (route part), 12
- [ ] **Remove the dead OperatingHoursStep** — Delete `venue-onboarding/OperatingHoursStep.tsx`, its test and `validateOperatingHours`; move `OperatingHoursValidationErrors` to `quick-setup-draft.ts`. (tracker: #8474)
  - Files: `apps/hospitality/src/components/venue-onboarding/OperatingHoursStep.tsx` and its test (delete); `components/availability/quick-setup-draft.ts` (receives the type); `QuickSetupHoursStep.tsx`, `useOnboardingWizard.ts` (repoint imports); `onboarding-localization.test.tsx` and `staff-pages-localization.test.tsx` (remove the cases and mock that name the step); `journey-recorder.ts` (reword the comment).
  - RED tests: Component (RED first): a test that asserts nothing under `apps/hospitality/src` imports `OperatingHoursStep` or `validateOperatingHours` (a grep-style guard test) and that the onboarding wizard hours step renders `QuickSetupHoursStep`. Existing onboarding component tests stay green.
  - Accept: `grep -r OperatingHoursStep apps/hospitality/src` returns nothing; `pnpm --filter hospitality typecheck` and the onboarding component tests pass; the wizard still renders `QuickSetupHoursStep`.
  - Blocked by: —
  - PRD: 2 (wizard step drops), 12, 13
- [ ] **Section closure: migration, engine expansion and server** — ADR-032: `date_rules.section_id`, `expandSectionRules`, types, snapshot/rows/plan adapters and section-delete materialisation. (tracker: #8475)
  - Files: `services/reservations/prisma/schema.prisma` (`DateRule.sectionId` + relation + index; `FloorPlanSection.dateRules`; rewrite the "`sectionId` (P3) is deliberately absent" comment); new folder `services/reservations/prisma/migrations/<timestamp>_add_date_rule_section/migration.sql` (additive nullable column, index, FK `ON DELETE SET NULL`; no default, nothing dropped); `packages/availability` (`expandSectionRules`, `ResolvedClosure` and day-summary closure carry optional `sectionId`, `validateConfig` rejects `sectionId` on anything but `kind: closure` + `targetKind: tables`); `packages/types/src/schemas/availability-config.ts` (`DateRuleBase.sectionId: IdSchema.nullish()`, day-summary closure optional `sectionId`); `services/reservations` `availability-snapshot.ts`, `availability-config-rows.ts`, `availability-config-plan.ts`, `floorPlanSectionService.delete`.
  - RED tests: Unit (`packages/availability`): `expandSectionRules` replaces `tableIds` from membership, returns empty for an unknown section, leaves other rules as is, does not mutate, is idempotent; `validateConfig` rejects `sectionId` on a non-table-closure rule. Service: config save with a section rule writes `sectionId` and no `DateRuleTable` rows; `referenceIssues` rejects a section from another venue; changed-row compare treats `tableIds` as derived; snapshot expansion makes a table moved into the section blocked and one moved out bookable (guest-facing result via `assert-bookable`); deleting a section with a live closure materialises `DateRuleTable` rows, nulls `sectionId` and keeps the closure as a plain tables closure; an expired closure is not materialised. Migration test: all migrations apply to a scratch database and a section rule inserts. `availability-migration.golden.test.ts` unchanged and green (backfill emits `sectionId` null).
  - Accept: Migration folder exists, applies forward on a scratch database in the test, and is never run against a real database; legacy migration/backfill path yields rules with `sectionId` null (golden test green); engine and its property test unchanged and green; guest-facing availability for a section closure follows live membership. Implement MUST verify whether deleting a floor plan (or the plan-delete path) hard-deletes sections by cascade; if it does, apply the same materialisation step there and cover it with a test, otherwise record the verified path in the PR body. Dedicated migration PR body states: additive, nullable, no backfill needed.
  - Blocked by: —
  - PRD: 4 (mechanism and guest-facing result), 12

## Milestone 2: Section-aware editors: a Manager can block a named section, deep-link into Availability, assign tables to sections and see Tonight grouped by section

- [ ] **Close dialog: One section choice and section naming** — Add `{ kind: "section", sectionId }` to the Close dialog's "What" choices and name a section closure by section on the calendar, day drawer and Special dates. (tracker: #8476)
  - Files: `apps/hospitality/src/components/availability` `close-draft.ts`, `CloseStepOne.tsx`, `closure-band.ts`, the day drawer, `SpecialDatesTab.tsx`; i18n catalogs `availability.close.*`.
  - RED tests: Unit: `close-draft` emits `{ targetKind: "tables", sectionId, tableIds }` with `tableIds` from the client table list through `expandSectionRules`. Component: "One section" lists the venue's sections, is disabled with a reason when there are none; calendar band, drawer and Special dates show the section name, not a table list; a `tables` rule with no `sectionId` still reads "Tables blocked". e2e: Manager closes one named section for one date and the date shows the section name. New copy in en-US, es-MX and fr-CA; the i18n key-parity test passes.
  - Accept: A Manager blocks one named section for one date from the Close dialog and every surface shows the section by name; the bookings-affected count uses expanded `tableIds` unchanged; existing close-dialog specs green.
  - Blocked by: Section closure: migration, engine expansion and server
  - PRD: 4, 11, 12
- [ ] **Availability entry contract and always-shown Schedules tab** — `parseAvailabilityEntry` / `availabilityPath(entry)` for `?tab=`, `?closeSection=`, `?from=setup`; the Schedules tab always shows to a manager. (tracker: #8477)
  - Files: `apps/hospitality/src/components/availability` (new `parseAvailabilityEntry`, `availabilityPath`), `AvailabilityPage.tsx` (read once on mount, then remove `closeSection` with `replace`; back-link "Venue Setup" when `from=setup`), `AvailabilityScheduleControls.tsx:37` (drop the `hasOwnSchedules` gate; "Create another schedule…" moves onto the Schedules tab), `availability-*.spec.ts` where the toolbar button moved; i18n `availability.*`.
  - RED tests: Unit: Zod parse accepts valid `tab`, `closeSection`, `from`; ignores invalid and unknown values; `availabilityPath` round-trips. Component: a one-schedule venue shows the Schedules tab to a Manager and not to a Host; `closeSection` opens the Close dialog (needs the Close dialog item when present; before it lands the param is parsed and removed, dialog preselection is covered once that item is merged); `from=setup` shows the back-link; the param is removed from the URL after mount. e2e: `/availability?tab=schedules` opens Schedules; garbage params render the default page. New copy in en-US, es-MX and fr-CA; the i18n key-parity test passes.
  - Accept: Deep links work and never error; a one-schedule venue sees the schedule level; no route changes; existing availability e2e green, edits limited to the moved "Create another schedule…" entry and listed in the PR body.
  - Blocked by: —
  - PRD: 1 (schedule level), 7, 8, 11, 12
- [ ] **Table Section select** — A `Section` select (the floor plan's sections plus "No section") on `TableDetailsForm.tsx`, saved through the existing table update; hidden for non-managers. (tracker: #8478)
  - Files: `apps/hospitality/src/components/floor-plan/TableDetailsForm.tsx` (and its hooks: `useFloorPlanSections`, `useUpdateTable`); i18n `floorPlan.*`.
  - RED tests: Component: the select lists the table's floor plan's sections and "No section"; changing it calls the table update with `sectionId` (null for none); hidden for a non-manager. e2e (floor-plan spec): assign a table to a section and see it persisted. New copy in en-US, es-MX and fr-CA; the i18n key-parity test passes.
  - Accept: A Manager moves a table into and out of a section from the table form; no "Add section" control is built; existing floor-plan specs green.
  - Blocked by: —
  - PRD: 4 (needs sections populated), 9, 11, 12
- [ ] **Tonight grouping by floor-plan section** — `TonightControl.tsx` groups the block-tables list by `Table.sectionId` and section name, plus "No section"; free-text `location` leaves the list. (tracker: #8479)
  - Files: `apps/hospitality/src/components/availability/TonightControl.tsx`; i18n `availability.tonight.*`.
  - RED tests: Component: tables group under their section name; a table with no section is under "No section"; rows show the table name only (no `location`); picking tables still sends `tableIds` via `block_tables`. Existing Tonight specs updated only for the grouping change, listed in the PR body. New copy in en-US, es-MX and fr-CA; the i18n key-parity test passes.
  - Accept: Tonight's block-tables list is grouped by section with a "No section" group; the `block_tables` payload is unchanged; `Table.location` stays in the data and on the table form.
  - Blocked by: —
  - PRD: 5, 7, 11, 12

## Milestone 3: One setup surface: the Venue Setup hub, the navigation that points at it, and the scenarios that prove the demo

- [ ] **Venue Setup hub and standing /setup** — `setup-tree.ts` pure tree builder plus the Venue Setup page replacing `SetupPage`; `/setup` stops bouncing operational venues. (tracker: #8480)
  - Files: new `apps/hospitality/src/components/venue-setup/setup-tree.ts` and page adapter (replaces `apps/hospitality/src/pages/SetupPage.tsx`); `DashboardLayout.tsx` (remove the operational bounce from exactly `/setup`; unready venues still go to `/setup` from `/timeline`, `/reservations`, `/guests`); `main.tsx` (`/setup/hours` redirect kept); uses `useAvailabilityConfig`, `useFloorPlans`, `useFloorPlanSections`, `useTables`, the booking-rules read, `useVenueReadiness`, `useIsManager`, `availabilityPath`; i18n `setup.*`; `onboarding.spec.ts` and any spec asserting the `/setup` bounce (changed deliberately, listed in the PR body). Per-group loading/error with the existing `describeApiError` text and Retry; both failing falls back to `ErrorRetryBanner`. Disclosure rows are buttons with `aria-expanded` (no `role="tree"`). Section action and closure rows use the Close dialog / section closure data when merged and are hidden if absent.
  - RED tests: Unit (`setup-tree`): venue → schedules → services, floor plan → sections → tables, special dates → their targets; empty venue marks every node "not set up" with what it is; a one-schedule venue still has the schedule level; Host variant has no actions; first unset node is the primary action pre-launch. Component per resource type: node shows current value or count after the editor saves; per-group error/retry. e2e: empty fixture venue lists every criterion-1 type as not set up; node actions open the one primary editor; an operational venue stays on `/setup`; an unready venue is still bounced from `/timeline`; `/setup/hours` still lands on `/availability`; Host sees no editor, save or "set up" call to action. New copy in en-US, es-MX and fr-CA; the i18n key-parity test passes.
  - Accept: `/setup` renders the hub for setup and operational venues; every node in PRD criterion 1 is present with its nesting and state; every action links to an existing editor; Host variant has no editors; old routes resolve.
  - Blocked by: Viewer role gate; Availability entry contract and always-shown Schedules tab
  - PRD: 1, 2, 3 (first unset node), 6, 8, 9 (partial), 10, 11, 12
- [ ] **Navigation, route labels and glossary terms** — One "Venue Setup" nav item (`/setup`) in both readiness states with the progress count; remove the pre-launch step items and "Floor Plans"; route labels per the UX glossary; retire old terms in three locales. (tracker: #8481)
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

## Design gaps found

None.

## Notes

- Verification the architecture left to Implement: whether deleting a floor plan (the plan-delete path) hard-deletes sections by cascade. It is carried in the item "Section closure: migration, engine expansion and server".
- Entry-point spec edits (`availability-*.spec.ts`, `onboarding.spec.ts`, floor-plan specs, and any spec asserting the old `/setup` bounce) belong to the item that moves the entry point and are listed in that PR's body.
