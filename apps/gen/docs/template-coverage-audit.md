# Template Gallery Coverage Audit

Regenerated for the fifth Template Gallery batch (#5441, this issue #5521 = part 1/5).
`apps/gen/src/components/TemplateGallery.tsx` now ships **32** templates (verified via
`grep -c '    id: "' apps/gen/src/components/TemplateGallery.tsx` → 32), up from the 12
this audit's first pass covered and the 29 its batch-3 pass assumed. This regeneration
re-runs the doc's own method end to end against the current state and replaces the
coverage table, priority ordering, and batch-tier sections below — none of the prior
passes' numbers are still accurate.

## Method

`apps/gen/src/components/TemplateGallery.tsx` ships 32 templates, each a free-text
`prompt` string handed to the AI generator — there is no literal prompt→component
mapping, since generation is AI-driven and the model picks components at runtime.
"Covered" below means: an existing prompt's wording plausibly steers the generator
toward that component (keyword/semantic match between the **prompt** text — not the
`description` field — and the component's name/purpose), not a guarantee the generator
actually emits it.

`packages/rialto/src/components/` now has **87** component directories (verified via
`ls packages/rialto/src/components | grep -v '\.' | wc -l` → 87; the 5 non-directory
entries — `catalog-meta.ts`, `index.ts`, `components.test.tsx`, `interactions.test.tsx`,
`interactive.test.tsx` — are excluded, `ls | wc -l` on the raw directory returns 92).
This is **2 more than the 85 the previous passes audited** — `Handshake` and
`NeonSign` were added to the catalog since the last audit and are scored fresh below
(both come out uncovered; no template prompt mentions either).

Usage-frequency evidence comes from a single signal: grep-count `\b<ComponentName>\b`
occurrences across `apps/hospitality/src` + `apps/rialto-web/src` (`.ts`/`.tsx` files
only), gathered fresh from inside this worktree. This reflects components proven out
in real, shipping product surfaces, not just documented in Storybook. (The earlier
git-recency signal was dropped after being found too flat to discriminate — see prior
revisions of this file in `git log` — and is not re-run here.)

## PageHeader ambiguity — resolved

Proposal #5441 assumed `PageHeader` is still fully uncovered, carried forward from
the doc's earlier passes. A direct grep confirms `docs-wiki-page`'s **prompt** field
(not just its `description`) literally contains the phrase "page header":

```
$ grep -ni "pageheader\|page header" apps/gen/src/components/TemplateGallery.tsx
126:    description: "Documentation article with a page header, body content, and inline help tooltips",
221:    description: "Documentation page with a breadcrumb trail, page header, and site footer",
224:      "Documentation wiki page with a breadcrumb trail showing the page's location in the docs hierarchy, a page header with the article title, body content, and a site footer with links",
```

Line 224 is `docs-wiki-page`'s `prompt` field, and it reads "...a page header with the
article title...". Per this doc's own stated method (an existing prompt's wording
plausibly steering the generator toward that component via keyword/semantic match),
this is a direct, literal keyword match — not a stretch. **Verdict: `PageHeader` is
`Yes` as of the current 32-template gallery**, covered by `docs-wiki-page`. This
flips the assumption in proposal #5441 and in every prior revision of this table.

`DataList` remains `No` — the same grep command run for `datalist|data list` (see
below) returns zero matches anywhere in the file, confirming the issue's own
investigation note:

```
$ grep -ni "datalist\|data list" apps/gen/src/components/TemplateGallery.tsx
(no output)
```

**Related call, made for consistency:** the generic `Dialog` component is scored
`No` even though the literal word "dialog" appears twice in prompt text
(`settings-modal-flow`: "a confirmation dialog that appears before a destructive
action"; `delete-confirmation-flow`: "opens a confirmation dialog warning that the
action is permanent"). In both cases the phrase is specifically "confirmation
dialog", which is a closer name/purpose match to the dedicated `ConfirmDialog`
component (already scored `Yes` on both templates) than to the generic `Dialog`.
Crediting both would double-count the same two words for two different components
with no additional textual support for the generic one — unlike `PageHeader`, where
there is no more-specific sibling component and the match is unambiguous.

## Coverage table (all 87 components)

| #   | Component        | Covered? | Template(s) that plausibly exercise it                                                                    | Usage count (hospitality+rialto-web) |
| --- | ---------------- | -------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Accordion        | **Yes**  | compact-toolbar (grouped filters), app-shell (FAQ accordion)                                              | 14                                   |
| 2   | Alert            | **Yes**  | notification-center (feed of alert messages)                                                              | 140                                  |
| 3   | AppBar           | No       | —                                                                                                         | 0                                    |
| 4   | AspectRatio      | **Yes**  | blog-layout (featured image)                                                                              | 10                                   |
| 5   | Autocomplete     | **Yes**  | feature-flags-panel (flag search field)                                                                   | 24                                   |
| 6   | Avatar           | **Yes**  | team-directory (member avatars), blog-layout (author bio)                                                 | 60                                   |
| 7   | Badge            | **Yes**  | admin-dashboard (health indicators), pricing-page (tier badge)                                            | 330                                  |
| 8   | Banner           | **Yes**  | notification-center (site-wide announcement banner)                                                       | 62                                   |
| 9   | Breadcrumb       | **Yes**  | docs-wiki-page (breadcrumb trail)                                                                         | 35                                   |
| 10  | Button           | **Yes**  | registration-form, checkout-form, landing-page (CTA), delete-confirmation-flow (button)                   | 1087                                 |
| 11  | Calendar         | **Yes**  | appointment-scheduler (month grid)                                                                        | 23                                   |
| 12  | Card             | **Yes**  | analytics-dashboard (KPI cards), kanban-board (task cards), command-search-palette (hover cards)          | 617                                  |
| 13  | Chalkboard       | **Yes**  | restaurant-reservations-board (specials board)                                                            | 16                                   |
| 14  | ChatPanel        | No       | —                                                                                                         | 10                                   |
| 15  | Checkbox         | **Yes**  | delete-confirmation-flow (acknowledgment checkbox), data-table (bulk actions)                             | 130                                  |
| 16  | Collapsible      | **Yes**  | timeline (expandable details)                                                                             | 27                                   |
| 17  | Combobox         | **Yes**  | compact-toolbar (search field)                                                                            | 14                                   |
| 18  | CommandPalette   | **Yes**  | command-search-palette                                                                                    | 20                                   |
| 19  | ConfirmDialog    | **Yes**  | settings-modal-flow, delete-confirmation-flow (both say "confirmation dialog")                            | 31                                   |
| 20  | ContextMenu      | No       | —                                                                                                         | 7                                    |
| 21  | DataList         | No       | — (double-confirmed: zero grep matches for "data list"/"datalist" in the file)                            | 220                                  |
| 22  | DataTable        | **Yes**  | data-table                                                                                                | 41                                   |
| 23  | DatePicker       | **Yes**  | appointment-scheduler (date jump field)                                                                   | 14                                   |
| 24  | DateRange        | No       | —                                                                                                         | 5                                    |
| 25  | DateRangePicker  | No       | —                                                                                                         | 0                                    |
| 26  | DepartureBoard   | No       | —                                                                                                         | 18                                   |
| 27  | Dialog           | No       | — (see "PageHeader ambiguity — resolved"; "confirmation dialog" credited to ConfirmDialog instead)        | 46                                   |
| 28  | DisabledTooltip  | **Yes**  | command-search-palette (unavailable-command tooltips), delete-confirmation-flow (disabled-button tooltip) | 18                                   |
| 29  | Divider          | **Yes**  | blog-layout, generic section separator (semantic, no literal keyword)                                     | 128                                  |
| 30  | Drawer           | **Yes**  | settings-modal-flow (advanced-options drawer)                                                             | 48                                   |
| 31  | DropdownMenu     | No       | —                                                                                                         | 18                                   |
| 32  | EmptyState       | **Yes**  | loading-empty-states                                                                                      | 76                                   |
| 33  | ErrorBoundary    | No       | —                                                                                                         | 10                                   |
| 34  | Ferrofluid       | No       | —                                                                                                         | 8                                    |
| 35  | FlipDot          | No       | —                                                                                                         | 8                                    |
| 36  | Footer           | **Yes**  | docs-wiki-page (site footer)                                                                              | 33                                   |
| 37  | Form             | **Yes**  | registration-form, checkout-form, survey-form                                                             | 19                                   |
| 38  | FormField        | **Yes**  | registration-form, checkout-form, survey-form                                                             | 14                                   |
| 39  | GlobalNav        | **Yes**  | app-shell ("a GlobalNav header for primary site navigation")                                              | 15                                   |
| 40  | Handshake        | No       | — (new component since last audit; no prompt mentions it)                                                 | 61                                   |
| 41  | Heading          | **Yes**  | landing-page, blog-layout (generic titles)                                                                | 66                                   |
| 42  | Hero             | **Yes**  | landing-page, app-shell                                                                                   | 33                                   |
| 43  | HoverCard        | **Yes**  | command-search-palette (result previews)                                                                  | 20                                   |
| 44  | IconButton       | **Yes**  | compact-toolbar (quick actions)                                                                           | 22                                   |
| 45  | ImageUpload      | No       | —                                                                                                         | 0                                    |
| 46  | Input            | **Yes**  | registration-form, checkout-form, data-table (search)                                                     | 286                                  |
| 47  | InputGroup       | **Yes**  | checkout-form (address/payment groups)                                                                    | 21                                   |
| 48  | Kbd              | **Yes**  | keyboard-shortcuts                                                                                        | 66                                   |
| 49  | MasterOverride   | **Yes**  | feature-flags-panel ("a master override toggle to disable all flags at once")                             | 27                                   |
| 50  | Meter            | **Yes**  | capacity-monitor (storage/memory/quota meters)                                                            | 54                                   |
| 51  | Navbar           | No       | —                                                                                                         | 9                                    |
| 52  | NavigationMenu   | No       | —                                                                                                         | 6                                    |
| 53  | NeonSign         | No       | — (new component since last audit; no prompt mentions it)                                                 | 10                                   |
| 54  | NumberInput      | **Yes**  | inventory-editor ("stepper-based number inputs")                                                          | 31                                   |
| 55  | Odometer         | **Yes**  | metrics-ticker (rolling digit counters)                                                                   | 27                                   |
| 56  | PageHeader       | **Yes**  | docs-wiki-page — see "PageHeader ambiguity — resolved" above                                              | 128                                  |
| 57  | Pagination       | **Yes**  | data-table                                                                                                | 37                                   |
| 58  | PinInput         | **Yes**  | secure-verification ("a 6-digit PinInput for entering the one-time passcode")                             | 26                                   |
| 59  | Popover          | **Yes**  | appointment-scheduler (time-slot popover)                                                                 | 18                                   |
| 60  | Progress         | **Yes**  | survey-form (progress bar), sales-dashboard (conversion funnel, semantic)                                 | 51                                   |
| 61  | ScrollArea       | No       | —                                                                                                         | 12                                   |
| 62  | SegmentedControl | **Yes**  | preferences-panel (light/dark/system theme switcher)                                                      | 61                                   |
| 63  | Select           | **Yes**  | registration-form, checkout-form (shipping options, semantic)                                             | 219                                  |
| 64  | Sidebar          | No       | —                                                                                                         | 10                                   |
| 65  | SilkFlow         | No       | —                                                                                                         | 7                                    |
| 66  | Skeleton         | **Yes**  | loading-empty-states ("skeleton loading placeholders")                                                    | 126                                  |
| 67  | Slider           | **Yes**  | survey-form (rating scales, semantic)                                                                     | 26                                   |
| 68  | SplitFlap        | **Yes**  | metrics-ticker (announcement display)                                                                     | 19                                   |
| 69  | SplitScreenExit  | No       | —                                                                                                         | 5                                    |
| 70  | Stack            | **Yes**  | generic layout primitive, all templates                                                                   | 1098                                 |
| 71  | Stat             | **Yes**  | analytics-dashboard, admin-dashboard, sales-dashboard (KPI/revenue, semantic)                             | 83                                   |
| 72  | StatusLED        | **Yes**  | admin-dashboard (system health indicators, semantic)                                                      | 24                                   |
| 73  | Steps            | **Yes**  | registration-form (multi-step)                                                                            | 57                                   |
| 74  | Table            | **Yes**  | analytics-dashboard (activity table), data-table, pricing-page (comparison table)                         | 472                                  |
| 75  | Tabs             | **Yes**  | tabbed-settings-panel ("organized into tabs")                                                             | 27                                   |
| 76  | Tag              | **Yes**  | kanban-board, pricing-page (semantic)                                                                     | 141                                  |
| 77  | TapeChart        | **Yes**  | restaurant-reservations-board                                                                             | 44                                   |
| 78  | Text             | **Yes**  | generic body copy, all templates                                                                          | 1963                                 |
| 79  | TextArea         | **Yes**  | survey-form ("text areas")                                                                                | 43                                   |
| 80  | ThemeToggle      | No       | —                                                                                                         | 0                                    |
| 81  | TimePicker       | No       | —                                                                                                         | 7                                    |
| 82  | Timeline         | **Yes**  | timeline                                                                                                  | 84                                   |
| 83  | Toast            | No       | —                                                                                                         | 6                                    |
| 84  | Toggle           | **Yes**  | preferences-panel (toggle switches), feature-flags-panel (master override toggle)                         | 83                                   |
| 85  | Tooltip          | **Yes**  | help-center-page (help tooltips), delete-confirmation-flow (explanatory tooltip)                          | 58                                   |
| 86  | Tree             | No       | —                                                                                                         | 7                                    |
| 87  | WatchLoader      | No       | —                                                                                                         | 7                                    |

**Summary: 61 of 87 components (70%) are plausibly covered by an existing template
prompt; 26 (30%) are never mentioned or implied by any of the prompts.** This is a
substantial jump from the 41/85 (48%) the first audit pass reported — batches 2–4's
template additions plus the `PageHeader` resolution above account for the gain.

Note: as before, no template's language implies a dedicated chart component, because
**rialto has no `Chart` component at all** — the analytics/sales dashboard prompts
approximate charts with `Stat`, `Table`, and `Progress` instead. Still a genuine
catalog gap, not an audit miss, and still out of scope for templates alone.

## Priority ordering: all 26 uncovered components, ranked

Ranked by usage-frequency (grep count across `apps/hospitality/src` +
`apps/rialto-web/src`, § Method), ties broken alphabetically. This is now the
**entire** uncovered set — earlier passes worked through a "top 19" then a
"batch 3 candidate tier of 16"; both lists are now fully absorbed into the coverage
table above as `Yes`, and what remains is short enough to rank in one pass:

| Rank | Component       | Usage count | Category          |
| ---- | --------------- | ----------- | ----------------- |
| 1    | DataList        | 220         | Data display      |
| 2    | Handshake       | 61          | Visual/decorative |
| 3    | Dialog          | 46          | Feedback/overlay  |
| 4    | DepartureBoard  | 18          | Data display      |
| 5    | DropdownMenu    | 18          | Navigation/layout |
| 6    | ScrollArea      | 12          | Utility/content   |
| 7    | ChatPanel       | 10          | Utility/content   |
| 8    | ErrorBoundary   | 10          | Utility/content   |
| 9    | NeonSign        | 10          | Visual/decorative |
| 10   | Sidebar         | 10          | Navigation/layout |
| 11   | Navbar          | 9           | Navigation/layout |
| 12   | Ferrofluid      | 8           | Visual/decorative |
| 13   | FlipDot         | 8           | Visual/decorative |
| 14   | ContextMenu     | 7           | Navigation/layout |
| 15   | SilkFlow        | 7           | Visual/decorative |
| 16   | TimePicker      | 7           | Form controls     |
| 17   | Tree            | 7           | Data display      |
| 18   | WatchLoader     | 7           | Feedback/overlay  |
| 19   | NavigationMenu  | 6           | Navigation/layout |
| 20   | Toast           | 6           | Feedback/overlay  |
| 21   | DateRange       | 5           | Form controls     |
| 22   | SplitScreenExit | 5           | Utility/content   |
| 23   | AppBar          | 0           | Navigation/layout |
| 24   | DateRangePicker | 0           | Form controls     |
| 25   | ImageUpload     | 0           | Form controls     |
| 26   | ThemeToggle     | 0           | Form controls     |

`DataList` (220 uses) is by a wide margin the single highest-value uncovered
component in the entire catalog — higher usage than most already-`Yes` components.
`Dialog` (46) is worth a second look for a follow-up template despite the resolution
above crediting its two existing "confirmation dialog" mentions to `ConfirmDialog` —
a template using a _non-confirmation_ dialog (e.g. a generic modal form) would give
it a clean, unambiguous `Yes`.

### Grouped by category (for issues 3/5 and 4/5 to split against)

**Data display (3):** DataList, DepartureBoard, Tree — e.g. a "Directory / Team
Roster" or "File Browser" template (DataList, Tree), a transit-style "Live Departures
Board" template (DepartureBoard — pairs naturally with the existing TapeChart/
Chalkboard restaurant-reservations-board).

**Visual/decorative (5):** Handshake, NeonSign, Ferrofluid, FlipDot, SilkFlow — the
catalog's animated/novelty display components (siblings of the already-covered
Odometer/SplitFlap/Chalkboard/TapeChart). A "Brand Showcase" or "Storefront Sign"
template could plausibly reach for several of these at once (NeonSign, FlipDot,
Ferrofluid, SilkFlow); Handshake reads as a deal/agreement-confirmation motif and
could fit a "Partnership / Deal Closed" template.

**Feedback/overlay (3):** Dialog, WatchLoader, Toast — e.g. a generic "Modal Form"
template (Dialog, distinct from the confirmation-flow use already covered by
ConfirmDialog), a "Background Job Status" template (WatchLoader, Toast for
completion notices).

**Navigation/layout (6):** DropdownMenu, Sidebar, Navbar, ContextMenu,
NavigationMenu, AppBar — e.g. a fuller "App Shell / Admin Layout" template
(Sidebar, Navbar or AppBar, NavigationMenu) distinct from the existing GlobalNav-
based app-shell/marketing template, a "Right-Click Actions" template (ContextMenu,
DropdownMenu).

**Form controls (5):** TimePicker, DateRange, DateRangePicker, ImageUpload,
ThemeToggle — e.g. a "Meeting Scheduler" template pairing TimePicker with the
existing Calendar/DatePicker (appointment-scheduler), a "Date Range Report Filter"
template (DateRange, DateRangePicker), a "Profile Photo / Media Upload" template
(ImageUpload), a standalone "Theme Switcher" template distinct from the existing
SegmentedControl-based preferences-panel (ThemeToggle).

Total: **22 components** across five non-trivial groups (Data display, Visual/
decorative, Feedback/overlay minus the ambiguous Dialog re-mention, Navigation/
layout, Form controls) plus `Dialog` called out separately above — 26 uncovered in
total. A follow-up batch should not feel obligated to cover all 26 in two issues;
splitting by usage-rank (top 13 / bottom 13 from the ranked table) or by category
(above) are both reasonable ways for issues 3/5 and 4/5 to divide this list.
