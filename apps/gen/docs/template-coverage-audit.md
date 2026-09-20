# Template Gallery Coverage Audit

Grounds the Gen app's Template Gallery batches: which rialto components the gallery's
prompts plausibly reach, and which high-usage components no prompt reaches at all.

**Snapshot point: the 32-template gallery, immediately before batch 5.** The three
templates batch 5 adds (#5522, #5523, #5524) land in the same pull request as this
regeneration and take the gallery to 35 — so ranks 1–3 below (`DataList`,
`Handshake`, `DropdownMenu`) read as uncovered here _and are closed by the very
commit this document ships in_. That is deliberate: the ranking is the evidence
justifying those three picks, so it has to show the gaps open. A reader landing here
later should expect `grep -c '    id: "'` to report **35**, not 32, and should treat
the next regeneration — not this one — as the place those three flip to `**Yes**`.

The superseded rankings from earlier passes are preserved verbatim in § Appendix
rather than deleted, so a later batch can see what each one was working from.

Regeneration history — note the batch-3 row, which is why this pass exists:

| Pass                    | Gallery shipped at the time | Coverage table it used   | Components | Source                 |
| ----------------------- | --------------------------- | ------------------------ | ---------- | ---------------------- |
| Original audit          | 12                          | 12 templates (fresh)     | 85         | #4423 tracking / #4440 |
| Batch 3 candidate tier  | 24                          | 12 templates (stale)     | 85         | #4530 / #4645          |
| **Batch 5 (this pass)** | **32**                      | **32 templates (fresh)** | **87**     | #5441 / #5521          |

The batch-3 tier ranked components by re-filtering the _original_ 12-template
coverage table's "No" rows, at a point when batches 1–2 had already taken the gallery
to 24. Twelve templates' worth of coverage was invisible to its denominator, and at
least one component slipped through because of it: `ConfirmDialog` was ranked #4 on
that tier even though `settings-modal-flow` — already shipping at that commit — asks
for "a confirmation dialog that appears before a destructive action". This pass
re-derives every "Covered?" cell from the live prompts instead of inheriting any
of them.

## Method

`apps/gen/src/components/TemplateGallery.tsx` ships **32** templates (verified via
`grep -c '    id: "' apps/gen/src/components/TemplateGallery.tsx` → 32), each a
free-text `prompt` string handed to the AI generator — there is no literal
prompt→component mapping, since generation is AI-driven and the model picks
components at runtime. "Covered" below means: an existing prompt's wording plausibly
steers the generator toward that component (keyword/semantic match between the
**prompt** text and the component's name/purpose), not a guarantee the generator
actually emits it. `description` and `title` are deliberately **not** matched — they
are gallery-card copy, never sent to the generator.

`packages/rialto/src/components/` has **87** component directories (verified via
`ls packages/rialto/src/components | grep -v '\.' | wc -l` → 87; the 5 non-directory
entries — `catalog-meta.ts`, `index.ts`, `components.test.tsx`, `interactions.test.tsx`,
`interactive.test.tsx` — are excluded). That is **two more than the 85** the earlier
passes saw: `Handshake` and `NeonSign` have shipped since, and both are uncovered.

Evidence gathered from inside this worktree:

1. **Grep usage counts** — `\b<ComponentName>\b` occurrences across
   `apps/hospitality/src` + `apps/rialto-web/src` (`.ts`/`.tsx` files only). This is
   the primary and sole ranking signal: it reflects components proven out in real,
   shipping product surfaces, not just documented in Storybook. Counts have drifted
   upward across the board since the original pass (e.g. `Text` 1704 → 1979,
   `DataList` 205 → 220) as the two apps grew; the earlier tables' numbers are stale
   and should not be compared row-for-row against this one.
2. **Category buckets** — the five buckets in § Priority ordering are no longer
   hand-assigned. Each component is bucketed by which `apps/rialto-web/src/pages/<section>/`
   directory owns its showcase page (`data` → Data display, `overlays`/`feedback` →
   Feedback/overlay, `forms` → Form controls, `navigation`/`layout` →
   Navigation/layout). The seven components with no showcase page at all
   (`AppBar`, `ChatPanel`, `DateRangePicker`, `ErrorBoundary`, `ImageUpload`,
   `ThemeToggle`, `WatchLoader`) are the only hand-assigned rows.
3. **Git recency** — evaluated and **discarded** by the original pass: commits
   touching `packages/rialto/src/components/` are dominated by repo-wide lint and
   accessibility sweeps that touch 40–85 directories at once, so the signal cannot
   discriminate between components. Still true; still unused.

## Coverage table (all 87 components)

| #   | Component        | Covered? | Template(s) that plausibly exercise it                                           | Usage count (hospitality+rialto-web) |
| --- | ---------------- | -------- | -------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Accordion        | **Yes**  | app-shell (FAQ accordion), compact-toolbar (grouped filters)                     | 14                                   |
| 2   | Alert            | **Yes**  | notification-center (alert feed by severity)                                     | 141                                  |
| 3   | AppBar           | No       | —                                                                                | 0                                    |
| 4   | AspectRatio      | **Yes**  | blog-layout (featured image)                                                     | 10                                   |
| 5   | Autocomplete     | **Yes**  | feature-flags-panel (autocomplete search field)                                  | 24                                   |
| 6   | Avatar           | **Yes**  | team-directory (per-person avatar), blog-layout (author bio)                     | 60                                   |
| 7   | Badge            | **Yes**  | admin-dashboard (health indicators), pricing-page (tier badge)                   | 337                                  |
| 8   | Banner           | **Yes**  | notification-center (dismissible announcement banner)                            | 62                                   |
| 9   | Breadcrumb       | **Yes**  | docs-wiki-page (breadcrumb trail)                                                | 35                                   |
| 10  | Button           | **Yes**  | registration-form, compact-toolbar, landing-page (CTA), delete-confirmation-flow | 1101                                 |
| 11  | Calendar         | **Yes**  | appointment-scheduler (month grid)                                               | 25                                   |
| 12  | Card             | **Yes**  | analytics-dashboard (KPI cards), kanban-board (task cards), landing-page         | 621                                  |
| 13  | Chalkboard       | **Yes**  | restaurant-reservations-board (specials board)                                   | 16                                   |
| 14  | ChatPanel        | No       | —                                                                                | 10                                   |
| 15  | Checkbox         | **Yes**  | registration-form, data-table (bulk actions), delete-confirmation-flow           | 130                                  |
| 16  | Collapsible      | **Yes**  | timeline (expandable details)                                                    | 27                                   |
| 17  | Combobox         | **Yes**  | compact-toolbar (search field)                                                   | 14                                   |
| 18  | CommandPalette   | **Yes**  | command-search-palette                                                           | 20                                   |
| 19  | ConfirmDialog    | **Yes**  | settings-modal-flow, delete-confirmation-flow                                    | 36                                   |
| 20  | ContextMenu      | No       | —                                                                                | 7                                    |
| 21  | DataList         | No       | —                                                                                | 220                                  |
| 22  | DataTable        | **Yes**  | data-table                                                                       | 41                                   |
| 23  | DatePicker       | **Yes**  | appointment-scheduler (date jump field)                                          | 14                                   |
| 24  | DateRange        | No       | —                                                                                | 5                                    |
| 25  | DateRangePicker  | No       | —                                                                                | 0                                    |
| 26  | DepartureBoard   | **Yes**  | metrics-ticker (split-flap headline cycling) — weak, see note 2                  | 18                                   |
| 27  | Dialog           | **Yes**  | settings-modal-flow, delete-confirmation-flow                                    | 46                                   |
| 28  | DisabledTooltip  | **Yes**  | command-search-palette, delete-confirmation-flow                                 | 18                                   |
| 29  | Divider          | **Yes**  | blog-layout, generic section separator                                           | 128                                  |
| 30  | Drawer           | **Yes**  | settings-modal-flow (slide-out drawer)                                           | 48                                   |
| 31  | DropdownMenu     | No       | —                                                                                | 18                                   |
| 32  | EmptyState       | **Yes**  | loading-empty-states                                                             | 78                                   |
| 33  | ErrorBoundary    | No       | —                                                                                | 10                                   |
| 34  | Ferrofluid       | No       | —                                                                                | 8                                    |
| 35  | FlipDot          | No       | —                                                                                | 8                                    |
| 36  | Footer           | **Yes**  | docs-wiki-page (site footer)                                                     | 33                                   |
| 37  | Form             | **Yes**  | registration-form, checkout-form, survey-form, inventory-editor                  | 19                                   |
| 38  | FormField        | **Yes**  | registration-form, checkout-form, survey-form                                    | 14                                   |
| 39  | GlobalNav        | **Yes**  | app-shell (named explicitly)                                                     | 15                                   |
| 40  | Handshake        | No       | —                                                                                | 61                                   |
| 41  | Heading          | **Yes**  | help-center-page (section headings), landing-page, blog-layout                   | 66                                   |
| 42  | Hero             | **Yes**  | landing-page, app-shell                                                          | 33                                   |
| 43  | HoverCard        | **Yes**  | command-search-palette (result previews)                                         | 20                                   |
| 44  | IconButton       | **Yes**  | compact-toolbar (quick actions)                                                  | 22                                   |
| 45  | ImageUpload      | No       | —                                                                                | 0                                    |
| 46  | Input            | **Yes**  | registration-form, checkout-form, data-table (search)                            | 285                                  |
| 47  | InputGroup       | **Yes**  | checkout-form (address/payment groups)                                           | 21                                   |
| 48  | Kbd              | **Yes**  | keyboard-shortcuts (physical-keyboard-key styling)                               | 66                                   |
| 49  | MasterOverride   | **Yes**  | feature-flags-panel (master override toggle)                                     | 27                                   |
| 50  | Meter            | **Yes**  | capacity-monitor (usage meters)                                                  | 54                                   |
| 51  | Navbar           | No       | —                                                                                | 9                                    |
| 52  | NavigationMenu   | No       | —                                                                                | 6                                    |
| 53  | NeonSign         | No       | —                                                                                | 10                                   |
| 54  | NumberInput      | **Yes**  | inventory-editor (stepper number inputs)                                         | 31                                   |
| 55  | Odometer         | **Yes**  | metrics-ticker (rolling digit counters)                                          | 27                                   |
| 56  | PageHeader       | **Yes**  | docs-wiki-page (page header with the article title) — see note 1                 | 128                                  |
| 57  | Pagination       | **Yes**  | data-table                                                                       | 37                                   |
| 58  | PinInput         | **Yes**  | secure-verification (named explicitly)                                           | 26                                   |
| 59  | Popover          | **Yes**  | appointment-scheduler (time-slot popover)                                        | 18                                   |
| 60  | Progress         | **Yes**  | survey-form (progress bar), sales-dashboard (conversion funnel)                  | 51                                   |
| 61  | ScrollArea       | No       | —                                                                                | 12                                   |
| 62  | SegmentedControl | **Yes**  | preferences-panel (light/dark/system switcher)                                   | 61                                   |
| 63  | Select           | **Yes**  | registration-form, checkout-form (shipping options)                              | 221                                  |
| 64  | Sidebar          | No       | —                                                                                | 10                                   |
| 65  | SilkFlow         | No       | —                                                                                | 7                                    |
| 66  | Skeleton         | **Yes**  | loading-empty-states (skeleton placeholders)                                     | 127                                  |
| 67  | Slider           | **Yes**  | survey-form (rating scales)                                                      | 26                                   |
| 68  | SplitFlap        | **Yes**  | metrics-ticker (announcement display)                                            | 19                                   |
| 69  | SplitScreenExit  | No       | —                                                                                | 5                                    |
| 70  | Stack            | **Yes**  | generic layout primitive, all templates                                          | 1112                                 |
| 71  | Stat             | **Yes**  | analytics-dashboard, admin-dashboard, sales-dashboard, metrics-ticker            | 83                                   |
| 72  | StatusLED        | **Yes**  | admin-dashboard (system health indicators)                                       | 24                                   |
| 73  | Steps            | **Yes**  | registration-form (multi-step)                                                   | 57                                   |
| 74  | Table            | **Yes**  | analytics-dashboard, data-table, pricing-page (comparison table)                 | 482                                  |
| 75  | Tabs             | **Yes**  | tabbed-settings-panel                                                            | 27                                   |
| 76  | Tag              | **Yes**  | kanban-board, pricing-page                                                       | 148                                  |
| 77  | TapeChart        | **Yes**  | restaurant-reservations-board                                                    | 44                                   |
| 78  | Text             | **Yes**  | generic body copy, all templates                                                 | 1979                                 |
| 79  | TextArea         | **Yes**  | survey-form (text areas)                                                         | 43                                   |
| 80  | ThemeToggle      | No       | —                                                                                | 0                                    |
| 81  | TimePicker       | No       | —                                                                                | 7                                    |
| 82  | Timeline         | **Yes**  | timeline                                                                         | 85                                   |
| 83  | Toast            | No       | —                                                                                | 6                                    |
| 84  | Toggle           | **Yes**  | preferences-panel (toggle switches), feature-flags-panel                         | 83                                   |
| 85  | Tooltip          | **Yes**  | help-center-page (help tooltips), command-search-palette                         | 58                                   |
| 86  | Tree             | No       | —                                                                                | 7                                    |
| 87  | WatchLoader      | No       | —                                                                                | 7                                    |

**Summary: 63 of 87 components (72%) are plausibly covered by an existing template
prompt; 24 (28%) are never mentioned or implied by any of them.** The original
12-template pass scored 41 of 85 (48%); twenty added templates closed 22 gaps while
the catalog itself grew by two.

### Note 1 — `PageHeader` is resolved as **covered**

The batch-5 proposal (#5441) assumed `PageHeader` (128 usages) was still fully
uncovered and slated it as the batch's second target. Re-running the method says
otherwise: `docs-wiki-page`'s prompt contains the literal phrase **"a page header
with the article title"**, which is a direct keyword match on the component's name
_and_ a match on its purpose (a title block at the top of a page), and
`help-center-page` reinforces it with "a header showing the article title and
category". Under the method this document has used since its first pass, that is a
`**Yes**`.

The verdict is graded, not free: this is a lowercase prose mention, weaker than the
strongest covers in the table — `secure-verification` and `app-shell` name
`PinInput`, `GlobalNav` and `Accordion` as components. A future batch wanting to
harden the steer should add an explicit `PageHeader` mention rather than treat the
gap as open. **Batch 5's issue 3/5 therefore skipped `PageHeader` and took rank 2
(`Handshake`) instead.**

### Note 2 — `DepartureBoard` is resolved as **covered (weak)**

Same class of call, found while ranking. `metrics-ticker`'s prompt asks for "a
split-flap display panel cycling through headline announcements";
`DepartureBoard` is documented in its own source as "a split-flap departure board
that flips through a sequence of headlines", composing `SplitFlap` to do it. The
prompt describes that behaviour exactly, so it is graded `**Yes**` for consistency
with note 1 — but it is a derivative cover: the same clause is `SplitFlap`'s primary
steer, and a generator reading it may well reach for the primitive rather than the
composite.

This one changes a rank. Graded `No`, `DepartureBoard` would tie `DropdownMenu` at
18 usages and take rank 3 on the alphabetical tie-break this document uses. It is
graded `Yes`, so **batch 5's issue 4/5 took `DropdownMenu`** — a component with zero
mention of any kind in any of the 32 prompts, which makes it the cleaner gap
regardless of how this call lands. `DepartureBoard` remains a candidate for a
_reinforcing_ template in a later batch.

### Note 3 — no template implies a chart component

Carried forward from the original pass and still true: no prompt's language implies
a chart component (`line chart`, `bar chart`, `revenue chart`), because **rialto has
no `Chart` component at all** — the analytics/sales dashboard prompts approximate
charts with `Stat`, `Table`, and `Progress` instead. This is a genuine catalog gap,
not an audit miss; it cannot be closed by a template alone (it needs a new rialto
component), so it is called out here rather than ranked below.

## Priority ordering: top uncovered components to target next

All **24** uncovered components, ranked by usage count descending, ties broken
alphabetically. Unlike earlier passes this list is not truncated — the tail is short
enough to show whole, and the drop-off after rank 3 is the most useful thing in it.

| Rank | Component       | Usage count | Category          |
| ---- | --------------- | ----------- | ----------------- |
| 1    | DataList        | 220         | Data display      |
| 2    | Handshake       | 61          | Data display      |
| 3    | DropdownMenu    | 18          | Feedback/overlay  |
| 4    | ScrollArea      | 12          | Navigation/layout |
| 5    | ChatPanel       | 10          | Utility/content   |
| 6    | ErrorBoundary   | 10          | Utility/content   |
| 7    | NeonSign        | 10          | Data display      |
| 8    | Sidebar         | 10          | Navigation/layout |
| 9    | Navbar          | 9           | Navigation/layout |
| 10   | Ferrofluid      | 8           | Data display      |
| 11   | FlipDot         | 8           | Data display      |
| 12   | ContextMenu     | 7           | Feedback/overlay  |
| 13   | SilkFlow        | 7           | Data display      |
| 14   | TimePicker      | 7           | Form controls     |
| 15   | Tree            | 7           | Data display      |
| 16   | WatchLoader     | 7           | Utility/content   |
| 17   | NavigationMenu  | 6           | Navigation/layout |
| 18   | Toast           | 6           | Feedback/overlay  |
| 19   | DateRange       | 5           | Form controls     |
| 20   | SplitScreenExit | 5           | Navigation/layout |
| 21   | AppBar          | 0           | Navigation/layout |
| 22   | DateRangePicker | 0           | Form controls     |
| 23   | ImageUpload     | 0           | Form controls     |
| 24   | ThemeToggle     | 0           | Form controls     |

**The batch is close to exhausted.** Rank 1 (`DataList`, 220) is an order of
magnitude above rank 3, and everything from rank 4 down sits at ≤12 usages —
below the 14-usage floor of the batch-3 tier, and four entries have **zero** product
usage at all. Batch 5 takes ranks 1–3; a batch 6 drawn from rank 4 onward would be
chasing components the two apps barely use, and should be justified on something
other than usage frequency (or skipped).

### Grouped by category

**Data display (7):** DataList (220), Handshake (61), NeonSign (10), Ferrofluid (8),
FlipDot (8), SilkFlow (7), Tree (7) — e.g. a "Record Detail Panel" template
(`DataList`), an "Integration Handshake Status" template (`Handshake`), a venue
open/closed status template (`NeonSign`).

**Feedback/overlay (3):** DropdownMenu (18), ContextMenu (7), Toast (6) — e.g. a
"Row Actions Menu" template (`DropdownMenu`, and `ContextMenu` as its right-click
sibling), a save-confirmation template (`Toast`).

**Navigation/layout (6):** ScrollArea (12), Sidebar (10), Navbar (9),
NavigationMenu (6), SplitScreenExit (5), AppBar (0) — e.g. a fuller admin-shell
template (`Sidebar`, `Navbar`, `NavigationMenu`) distinct from the existing
`app-shell`.

**Form controls (5):** TimePicker (7), DateRange (5), DateRangePicker (0),
ImageUpload (0), ThemeToggle (0) — e.g. a reporting-range template
(`DateRange`, `DateRangePicker`), a profile-editor template (`ImageUpload`).

**Utility/content (3):** ChatPanel (10), ErrorBoundary (10), WatchLoader (7) —
support-surface and failure-state components; `ErrorBoundary` and `WatchLoader` are
infrastructure rather than page furniture and may not belong in a gallery template
at all.

Batch 5 draws its three template-adding issues (#5522, #5523, #5524) from ranks 1–3
of the table above.

## Appendix: superseded passes

Preserved for provenance. **Both tables below are stale** — their coverage verdicts
predate 20 templates, and their usage counts predate the apps' growth. Read
§ Priority ordering instead.

### Superseded: original top-19 priority ordering (12-template pass, #4440)

Ranked against the 12-template gallery, restricted to the components uncovered at
that time:

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

Ranks 2–19 are all `**Yes**` in the current coverage table, closed by the first 24
templates. Rank 1 (`DataList`) survived every batch since and is closed by batch 5's
#5522; rank 4 (`PageHeader`) was closed incidentally rather than deliberately, by
`docs-wiki-page`'s "a page header with the article title" (see § Note 1).

### Superseded: batch 3 candidate tier (#4530 / #4645)

Re-ran the same method against the 38 components then still marked "No" that were not
already in the top-19 list. Ranked by usage count descending, ties broken
alphabetically, taking the top 16 (a 4-way tie at usage count 14 lands exactly on
ranks 13–16):

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

Every row above is `**Yes**` in the current coverage table. Batches 3–4 closed most of
them; `ConfirmDialog` (rank 4) never needed closing, as noted above.
