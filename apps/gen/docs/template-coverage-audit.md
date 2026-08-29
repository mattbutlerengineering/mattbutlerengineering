# Template Gallery Coverage Audit

Part 1/4 of widening the Gen app's Template Gallery beyond 12 templates. Grounds the
two template-adding batches that follow (#4423 tracking).

## Method

`apps/gen/src/components/TemplateGallery.tsx` ships 12 templates, each a free-text
`prompt` string handed to the AI generator — there is no literal prompt→component
mapping, since generation is AI-driven and the model picks components at runtime.
"Covered" below means: an existing prompt's wording plausibly steers the generator
toward that component (keyword/semantic match between the prompt text and the
component's name/purpose), not a guarantee the generator actually emits it.

`packages/rialto/src/components/` has **85** component directories (verified via
`ls packages/rialto/src/components | grep -v '\.' | wc -l` → 85; the 5 non-directory
entries — `catalog-meta.ts`, `index.ts`, `components.test.tsx`, `interactions.test.tsx`,
`interactive.test.tsx` — are excluded).

Usage-frequency evidence (§ Priority ordering) comes from two signals, gathered from
inside this worktree:

1. **Grep usage counts** — `\b<ComponentName>\b` occurrences across
   `apps/hospitality/src` + `apps/rialto-web/src` (`.ts`/`.tsx` files only). This is
   the primary signal: it reflects components proven out in real, shipping product
   surfaces, not just documented in Storybook.
2. **Git recency** — `git log --oneline --since="30 days ago" -- packages/rialto/src/components/`
   shows only 3 commits touching components in the last 30 days (`d48fa57`, `a29a4ae`,
   `7d34815`), and all three are repo-wide lint/accessibility sweeps that touched
   40–85 component directories each rather than targeted feature work on a handful of
   components. That signal is too flat to discriminate — every component got touched
   4–18 times by the same few sweep commits — so it is **not** used to break ties below;
   usage-count is the sole ranking signal.

## Coverage table (all 85 components)

| #   | Component        | Covered? | Template(s) that plausibly exercise it                                                                       | Usage count (hospitality+rialto-web) |
| --- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| 1   | Accordion        | **Yes**  | compact-toolbar (grouped advanced filters)                                                                   | 14                                   |
| 2   | Alert            | No       | —                                                                                                            | 138                                  |
| 3   | AppBar           | No       | —                                                                                                            | 0                                    |
| 4   | AspectRatio      | **Yes**  | blog-layout (featured image)                                                                                 | 10                                   |
| 5   | Autocomplete     | No       | —                                                                                                            | 24                                   |
| 6   | Avatar           | **Yes**  | blog-layout (author bio)                                                                                     | 58                                   |
| 7   | Badge            | **Yes**  | admin-dashboard (health indicators), pricing-page (tier badge)                                               | 301                                  |
| 8   | Banner           | No       | —                                                                                                            | 57                                   |
| 9   | Breadcrumb       | No       | —                                                                                                            | 29                                   |
| 10  | Button           | **Yes**  | registration-form, checkout-form, admin-dashboard (quick actions), landing-page (CTA)                        | 956                                  |
| 11  | Calendar         | **Yes**  | appointment-scheduler (month grid)                                                                           | 23                                   |
| 12  | Card             | **Yes**  | analytics-dashboard, admin-dashboard, checkout-form (order summary), kanban-board, landing-page, blog-layout | 540                                  |
| 13  | Chalkboard       | **Yes**  | restaurant-reservations-board (specials board)                                                               | 16                                   |
| 14  | ChatPanel        | No       | —                                                                                                            | 8                                    |
| 15  | Checkbox         | **Yes**  | registration-form (preferences), data-table (bulk actions), pricing-page (feature checklist)                 | 122                                  |
| 16  | Collapsible      | **Yes**  | timeline (expandable details)                                                                                | 21                                   |
| 17  | Combobox         | **Yes**  | compact-toolbar (search field)                                                                               | 14                                   |
| 18  | CommandPalette   | **Yes**  | command-search-palette                                                                                       | 16                                   |
| 19  | ConfirmDialog    | No       | —                                                                                                            | 21                                   |
| 20  | ContextMenu      | No       | —                                                                                                            | 7                                    |
| 21  | DataList         | No       | —                                                                                                            | 205                                  |
| 22  | DataTable        | **Yes**  | data-table                                                                                                   | 40                                   |
| 23  | DatePicker       | **Yes**  | appointment-scheduler (date jump field)                                                                      | 14                                   |
| 24  | DateRange        | No       | —                                                                                                            | 5                                    |
| 25  | DateRangePicker  | No       | —                                                                                                            | 0                                    |
| 26  | DepartureBoard   | No       | —                                                                                                            | 11                                   |
| 27  | Dialog           | No       | —                                                                                                            | 40                                   |
| 28  | DisabledTooltip  | **Yes**  | command-search-palette (unavailable command explanation)                                                     | 18                                   |
| 29  | Divider          | **Yes**  | blog-layout, generic section separator                                                                       | 112                                  |
| 30  | Drawer           | No       | —                                                                                                            | 39                                   |
| 31  | DropdownMenu     | No       | —                                                                                                            | 11                                   |
| 32  | EmptyState       | No       | —                                                                                                            | 63                                   |
| 33  | ErrorBoundary    | No       | —                                                                                                            | 10                                   |
| 34  | Ferrofluid       | No       | —                                                                                                            | 8                                    |
| 35  | FlipDot          | No       | —                                                                                                            | 8                                    |
| 36  | Footer           | No       | —                                                                                                            | 32                                   |
| 37  | Form             | **Yes**  | registration-form, checkout-form, survey-form                                                                | 18                                   |
| 38  | FormField        | **Yes**  | registration-form, checkout-form, survey-form                                                                | 14                                   |
| 39  | GlobalNav        | No       | —                                                                                                            | 14                                   |
| 40  | Heading          | **Yes**  | landing-page, blog-layout (generic titles)                                                                   | 47                                   |
| 41  | Hero             | **Yes**  | landing-page                                                                                                 | 33                                   |
| 42  | HoverCard        | **Yes**  | command-search-palette (result previews)                                                                     | 18                                   |
| 43  | IconButton       | **Yes**  | compact-toolbar (quick actions)                                                                              | 17                                   |
| 44  | ImageUpload      | No       | —                                                                                                            | 0                                    |
| 45  | Input            | **Yes**  | registration-form, checkout-form, data-table (search)                                                        | 264                                  |
| 46  | InputGroup       | **Yes**  | checkout-form (address/payment groups)                                                                       | 21                                   |
| 47  | Kbd              | No       | —                                                                                                            | 65                                   |
| 48  | MasterOverride   | No       | —                                                                                                            | 27                                   |
| 49  | Meter            | No       | —                                                                                                            | 43                                   |
| 50  | Navbar           | No       | —                                                                                                            | 9                                    |
| 51  | NavigationMenu   | No       | —                                                                                                            | 6                                    |
| 52  | NumberInput      | No       | —                                                                                                            | 28                                   |
| 53  | Odometer         | **Yes**  | metrics-ticker (rolling digit counters)                                                                      | 23                                   |
| 54  | PageHeader       | No       | —                                                                                                            | 105                                  |
| 55  | Pagination       | **Yes**  | data-table                                                                                                   | 31                                   |
| 56  | PinInput         | No       | —                                                                                                            | 18                                   |
| 57  | Popover          | **Yes**  | appointment-scheduler (time-slot popover)                                                                    | 18                                   |
| 58  | Progress         | **Yes**  | survey-form (progress bar), sales-dashboard (conversion funnel)                                              | 38                                   |
| 59  | ScrollArea       | No       | —                                                                                                            | 12                                   |
| 60  | SegmentedControl | No       | —                                                                                                            | 59                                   |
| 61  | Select           | **Yes**  | registration-form, checkout-form (shipping options)                                                          | 196                                  |
| 62  | Sidebar          | No       | —                                                                                                            | 11                                   |
| 63  | SilkFlow         | No       | —                                                                                                            | 7                                    |
| 64  | Skeleton         | No       | —                                                                                                            | 117                                  |
| 65  | Slider           | **Yes**  | survey-form (rating scales)                                                                                  | 25                                   |
| 66  | SplitFlap        | **Yes**  | metrics-ticker (announcement display)                                                                        | 16                                   |
| 67  | SplitScreenExit  | No       | —                                                                                                            | 5                                    |
| 68  | Stack            | **Yes**  | generic layout primitive, all templates                                                                      | 993                                  |
| 69  | Stat             | **Yes**  | analytics-dashboard, admin-dashboard, sales-dashboard (KPI/revenue)                                          | 78                                   |
| 70  | StatusLED        | **Yes**  | admin-dashboard (system health indicators)                                                                   | 3                                    |
| 71  | Steps            | **Yes**  | registration-form (multi-step)                                                                               | 38                                   |
| 72  | Table            | **Yes**  | analytics-dashboard, sales-dashboard, pricing-page (comparison table)                                        | 337                                  |
| 73  | Tabs             | No       | —                                                                                                            | 26                                   |
| 74  | Tag              | **Yes**  | kanban-board, pricing-page                                                                                   | 111                                  |
| 75  | TapeChart        | **Yes**  | restaurant-reservations-board                                                                                | 16                                   |
| 76  | Text             | **Yes**  | generic body copy, all templates                                                                             | 1704                                 |
| 77  | TextArea         | **Yes**  | survey-form                                                                                                  | 43                                   |
| 78  | ThemeToggle      | No       | —                                                                                                            | 0                                    |
| 79  | TimePicker       | No       | —                                                                                                            | 7                                    |
| 80  | Timeline         | **Yes**  | timeline                                                                                                     | 43                                   |
| 81  | Toast            | No       | —                                                                                                            | 6                                    |
| 82  | Toggle           | No       | —                                                                                                            | 74                                   |
| 83  | Tooltip          | No       | —                                                                                                            | 55                                   |
| 84  | Tree             | No       | —                                                                                                            | 7                                    |
| 85  | WatchLoader      | No       | —                                                                                                            | 0                                    |

**Summary: 41 of 85 components (48%) are plausibly covered by an existing template
prompt; 44 (52%) are never mentioned or implied by any of the prompts.** (Updated by
the batch-3 template additions — see the batch-3 candidate tier section below for
which components those templates target.)

Note: no template's language implies a chart component (`line chart`, `bar chart`,
`revenue chart`), because **rialto has no `Chart` component at all** — the analytics/
sales dashboard prompts approximate charts with `Stat`, `Table`, and `Progress`
instead. This is a genuine catalog gap, not an audit miss; it's out of scope for
templates alone (would need a new rialto component) so it's called out here rather
than added to the priority list below.

## Priority ordering: top uncovered components to target next

Ranked by real usage-frequency evidence (grep count across `apps/hospitality/src` +
`apps/rialto-web/src`, § Method signal 1), restricted to the 57 uncovered components,
descending:

| Rank | Component        | Usage count | Category          |
| ---- | ---------------- | ----------- | ----------------- |
| 1    | DataList         | 205         | Data display      |
| 2    | Alert            | 138         | Feedback/overlay  |
| 3    | Skeleton         | 117         | Feedback/overlay  |
| 4    | PageHeader       | 105         | Navigation/layout |
| 5    | Toggle           | 74          | Form controls     |
| 6    | Kbd              | 65          | Utility/content   |
| 7    | EmptyState       | 63          | Feedback/overlay  |
| 8    | SegmentedControl | 59          | Form controls     |
| 9    | Banner           | 57          | Feedback/overlay  |
| 10   | Tooltip          | 55          | Feedback/overlay  |
| 11   | Meter            | 43          | Feedback/overlay  |
| 12   | Dialog           | 40          | Feedback/overlay  |
| 13   | Drawer           | 39          | Feedback/overlay  |
| 14   | Footer           | 32          | Navigation/layout |
| 15   | Breadcrumb       | 29          | Navigation/layout |
| 16   | NumberInput      | 28          | Form controls     |
| 17   | MasterOverride   | 27          | Form controls     |
| 18   | Tabs             | 26          | Data display      |
| 19   | Autocomplete     | 24          | Form controls     |

(Calendar and Odometer, both usage count 23, are the next two below the cutoff —
candidates for a third batch if the two follow-up issues don't exhaust this list.)

### Grouped by category (for the next two batches to split templates against)

**Data display (2):** DataList, Tabs — e.g. a "Directory / Team Roster" template
(DataList), a "Tabbed Settings Panel" template (Tabs).

**Feedback/overlay (8):** Alert, Banner, Skeleton, EmptyState, Tooltip, Meter, Dialog,
Drawer — e.g. a "Notification Center" or "System Status" template (Alert, Banner,
Meter), a "Loading/Empty States Showcase" template (Skeleton, EmptyState), a
"Settings Modal Flow" template (Dialog, Drawer, Tooltip).

**Form controls (5):** Toggle, SegmentedControl, NumberInput, MasterOverride,
Autocomplete — e.g. a "Preferences / Feature Flags" template (Toggle,
SegmentedControl, MasterOverride), a "Quantity/Inventory Editor" template
(NumberInput), a "Command Search" or "Tag Picker" template (Autocomplete).

**Navigation/layout (3):** PageHeader, Footer, Breadcrumb — e.g. a fuller
"Docs / Wiki Page" template (PageHeader, Breadcrumb), folded into a fuller
"Marketing Site Shell" template alongside the existing Hero-based landing-page
(Footer).

**Utility/content (1):** Kbd — e.g. a "Command Search" or keyboard-shortcuts
reference template.

Total: **19 components** across the five groups, within the requested 15–20 range.
The two follow-up issues should split this list (roughly by category, or by count)
into two template-adding batches.

## Batch 3 candidate tier: next uncovered components below rank 19

Third batch (source proposal #4530), grounded by re-running the same method (§
Method, signal 1) against the **57 − 19 = 38** components still marked "No" in the
coverage table above that were _not_ already in the top-19 priority list. Ranked by
usage count descending, ties broken alphabetically, taking the top 16 (a 4-way tie
at usage count 14 lands exactly on ranks 13–16, within the requested 10–16 range —
see the note on ties below):

| Rank | Component       | Usage count | Category          |
| ---- | --------------- | ----------- | ----------------- |
| 1    | TapeChart       | 26          | Data display      |
| 2    | Calendar        | 23          | Form controls     |
| 3    | Odometer        | 23          | Data display      |
| 4    | ConfirmDialog   | 21          | Feedback/overlay  |
| 5    | DisabledTooltip | 18          | Feedback/overlay  |
| 6    | HoverCard       | 18          | Feedback/overlay  |
| 7    | PinInput        | 18          | Form controls     |
| 8    | Popover         | 18          | Feedback/overlay  |
| 9    | IconButton      | 17          | Form controls     |
| 10   | Chalkboard      | 16          | Data display      |
| 11   | CommandPalette  | 16          | Feedback/overlay  |
| 12   | SplitFlap       | 16          | Data display      |
| 13   | Accordion       | 14          | Navigation/layout |
| 14   | Combobox        | 14          | Form controls     |
| 15   | DatePicker      | 14          | Form controls     |
| 16   | GlobalNav       | 14          | Navigation/layout |

Note on ties: usage count 14 is a 4-way tie (Accordion, Combobox, DatePicker,
GlobalNav) sitting exactly at ranks 13–16 — all four are included rather than
truncated mid-tie, matching the existing table's own precedent of not breaking ties
arbitrarily.

Note on TapeChart: its live-verified count (26) is meaningfully higher than the
count recorded in the main coverage table above (16, row 75) — the gap traces to
visual-test-harness coverage added since that table was last populated
(`apps/rialto-web/src/pages/data/TapeChartPage.tsx`,
`apps/rialto-web/src/pages/visual-test/TapeChartSections.tsx`, and a TapeChart
section in `DarkModeSection.tsx`), not a change in grep method. Membership in this
tier is determined by exclusion from the original top-19 list, not by count, so
TapeChart's higher current count doesn't retroactively belong in the batch-1/2
list — it is ranked here on its own current merits.

Calendar and Odometer (ranks 2–3, both count 23) were already named as "the next
two below the cutoff" in § Priority ordering above; this table confirms that with a
live re-run and extends the ranking further down.

### Grouped by category (for batch 3)

**Data display (4):** TapeChart, Odometer, Chalkboard, SplitFlap — e.g. a
"Live Departures / Ops Board" template (TapeChart, Chalkboard), a "Metrics Ticker"
template (Odometer, SplitFlap).

**Feedback/overlay (5):** ConfirmDialog, DisabledTooltip, HoverCard, Popover,
CommandPalette — e.g. a "Destructive Action Confirmation" template (ConfirmDialog,
DisabledTooltip), a "Quick Actions / Search" template (CommandPalette, Popover,
HoverCard).

**Form controls (5):** Calendar, PinInput, IconButton, Combobox, DatePicker — e.g.
a "Booking / Scheduling" template (Calendar, DatePicker), a "Secure Verification"
template (PinInput), a "Compact Toolbar" template (IconButton, Combobox).

**Navigation/layout (2):** Accordion, GlobalNav — e.g. a "FAQ / Docs Sidebar"
template (Accordion), folded into a fuller "App Shell" template alongside the
existing landing-page Hero (GlobalNav).

Total: **16 components** across the four groups, within the requested 10–16 range.
A follow-up batch-3 issue should draw its template-adding work from this list.
