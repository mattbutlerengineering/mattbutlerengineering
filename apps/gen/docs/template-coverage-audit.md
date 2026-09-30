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

`packages/rialto/src/components/` now has **88** component directories (verified via
`ls packages/rialto/src/components | grep -v '\.' | wc -l` → 88; the 5 non-directory
entries — `catalog-meta.ts`, `index.ts`, `components.test.tsx`, `interactions.test.tsx`,
`interactive.test.tsx` — are excluded, `ls | wc -l` on the raw directory returns 93).
This is **1 more than the 87 the previous (batch 5) pass audited** — `Letterboard` was
added to the catalog since the last audit and is scored fresh below (it comes out
uncovered; no template prompt mentions it, per a direct grep for "letterboard"/"letter
board" against `TemplateGallery.tsx`).

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
there is no more-specific sibling component and the match is unambiguous. This
reasoning still holds for these two templates specifically; `Dialog` is scored `Yes`
overall as of this regeneration only because a third, batch-5 template
(`modal-form-dialog`) gives it an unambiguous, non-"confirmation dialog" match — see
§ Closed by batch 5 below.

## Coverage table (all 88 components)

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
| 21  | DataList         | **Yes**  | record-detail-panel (batch 5, #5522 — "a definition list of key-value pairs")                             | 220                                  |
| 22  | DataTable        | **Yes**  | data-table                                                                                                | 41                                   |
| 23  | DatePicker       | **Yes**  | appointment-scheduler (date jump field)                                                                   | 14                                   |
| 24  | DateRange        | No       | —                                                                                                         | 5                                    |
| 25  | DateRangePicker  | No       | —                                                                                                         | 0                                    |
| 26  | DepartureBoard   | No       | —                                                                                                         | 18                                   |
| 27  | Dialog           | **Yes**  | modal-form-dialog (batch 5, #5524 — generic modal form, distinct from ConfirmDialog's uses)               | 47                                   |
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
| 40  | Handshake        | **Yes**  | integration-handshake (batch 5, #5523 — deal/agreement-confirmation motif)                                | 61                                   |
| 41  | Heading          | **Yes**  | landing-page, blog-layout (generic titles)                                                                | 66                                   |
| 42  | Hero             | **Yes**  | landing-page, app-shell                                                                                   | 33                                   |
| 43  | HoverCard        | **Yes**  | command-search-palette (result previews)                                                                  | 20                                   |
| 44  | IconButton       | **Yes**  | compact-toolbar (quick actions)                                                                           | 22                                   |
| 45  | ImageUpload      | No       | —                                                                                                         | 0                                    |
| 46  | Input            | **Yes**  | registration-form, checkout-form, data-table (search)                                                     | 286                                  |
| 47  | InputGroup       | **Yes**  | checkout-form (address/payment groups)                                                                    | 21                                   |
| 48  | Kbd              | **Yes**  | keyboard-shortcuts                                                                                        | 66                                   |
| 49  | Letterboard      | No       | — (new component since last audit; no prompt mentions it)                                                 | 11                                   |
| 50  | MasterOverride   | **Yes**  | feature-flags-panel ("a master override toggle to disable all flags at once")                             | 27                                   |
| 51  | Meter            | **Yes**  | capacity-monitor (storage/memory/quota meters)                                                            | 54                                   |
| 52  | Navbar           | No       | —                                                                                                         | 9                                    |
| 53  | NavigationMenu   | No       | —                                                                                                         | 6                                    |
| 54  | NeonSign         | No       | —                                                                                                         | 10                                   |
| 55  | NumberInput      | **Yes**  | inventory-editor ("stepper-based number inputs")                                                          | 31                                   |
| 56  | Odometer         | **Yes**  | metrics-ticker (rolling digit counters)                                                                   | 27                                   |
| 57  | PageHeader       | **Yes**  | docs-wiki-page — see "PageHeader ambiguity — resolved" above                                              | 128                                  |
| 58  | Pagination       | **Yes**  | data-table                                                                                                | 37                                   |
| 59  | PinInput         | **Yes**  | secure-verification ("a 6-digit PinInput for entering the one-time passcode")                             | 26                                   |
| 60  | Popover          | **Yes**  | appointment-scheduler (time-slot popover)                                                                 | 18                                   |
| 61  | Progress         | **Yes**  | survey-form (progress bar), sales-dashboard (conversion funnel, semantic)                                 | 51                                   |
| 62  | ScrollArea       | No       | —                                                                                                         | 12                                   |
| 63  | SegmentedControl | **Yes**  | preferences-panel (light/dark/system theme switcher)                                                      | 61                                   |
| 64  | Select           | **Yes**  | registration-form, checkout-form (shipping options, semantic)                                             | 219                                  |
| 65  | Sidebar          | No       | —                                                                                                         | 10                                   |
| 66  | SilkFlow         | No       | —                                                                                                         | 7                                    |
| 67  | Skeleton         | **Yes**  | loading-empty-states ("skeleton loading placeholders")                                                    | 126                                  |
| 68  | Slider           | **Yes**  | survey-form (rating scales, semantic)                                                                     | 26                                   |
| 69  | SplitFlap        | **Yes**  | metrics-ticker (announcement display)                                                                     | 19                                   |
| 70  | SplitScreenExit  | No       | —                                                                                                         | 5                                    |
| 71  | Stack            | **Yes**  | generic layout primitive, all templates                                                                   | 1098                                 |
| 72  | Stat             | **Yes**  | analytics-dashboard, admin-dashboard, sales-dashboard (KPI/revenue, semantic)                             | 83                                   |
| 73  | StatusLED        | **Yes**  | admin-dashboard (system health indicators, semantic)                                                      | 24                                   |
| 74  | Steps            | **Yes**  | registration-form (multi-step)                                                                            | 57                                   |
| 75  | Table            | **Yes**  | analytics-dashboard (activity table), data-table, pricing-page (comparison table)                         | 472                                  |
| 76  | Tabs             | **Yes**  | tabbed-settings-panel ("organized into tabs")                                                             | 27                                   |
| 77  | Tag              | **Yes**  | kanban-board, pricing-page (semantic)                                                                     | 141                                  |
| 78  | TapeChart        | **Yes**  | restaurant-reservations-board                                                                             | 44                                   |
| 79  | Text             | **Yes**  | generic body copy, all templates                                                                          | 1963                                 |
| 80  | TextArea         | **Yes**  | survey-form ("text areas")                                                                                | 43                                   |
| 81  | ThemeToggle      | No       | —                                                                                                         | 0                                    |
| 82  | TimePicker       | No       | —                                                                                                         | 7                                    |
| 83  | Timeline         | **Yes**  | timeline                                                                                                  | 84                                   |
| 84  | Toast            | No       | —                                                                                                         | 6                                    |
| 85  | Toggle           | **Yes**  | preferences-panel (toggle switches), feature-flags-panel (master override toggle)                         | 83                                   |
| 86  | Tooltip          | **Yes**  | help-center-page (help tooltips), delete-confirmation-flow (explanatory tooltip)                          | 58                                   |
| 87  | Tree             | No       | —                                                                                                         | 7                                    |
| 88  | WatchLoader      | No       | —                                                                                                         | 7                                    |

**Summary: 64 of 88 components (73%) are plausibly covered by an existing template
prompt; 24 (27%) are never mentioned or implied by any of the prompts.** This is up
from the 61/87 (70%) the batch 5 pass reported — `DataList`, `Handshake`, and `Dialog`
flipping to `Yes` (per § Closed by batch 5 below) account for the gain, partly offset
by the newly-added `Letterboard` joining the catalog uncovered.

Note: as before, no template's language implies a dedicated chart component, because
**rialto has no `Chart` component at all** — the analytics/sales dashboard prompts
approximate charts with `Stat`, `Table`, and `Progress` instead. Still a genuine
catalog gap, not an audit miss, and still out of scope for templates alone.

## Priority ordering: all 24 uncovered components, ranked

Ranked by usage-frequency (grep count across `apps/hospitality/src` +
`apps/rialto-web/src`, § Method), ties broken alphabetically. `DataList`, `Handshake`,
and `Dialog` — ranks 1–3 in the batch 5 pass — are absorbed into the coverage table
above as `Yes` (see § Closed by batch 5 below) and drop out of this list; `Letterboard`
joins it as the one new component added to the catalog since that pass:

| Rank | Component       | Usage count | Category          |
| ---- | --------------- | ----------- | ----------------- |
| 1    | DepartureBoard  | 18          | Data display      |
| 2    | DropdownMenu    | 18          | Navigation/layout |
| 3    | ScrollArea      | 12          | Utility/content   |
| 4    | Letterboard     | 11          | Visual/decorative |
| 5    | ChatPanel       | 10          | Utility/content   |
| 6    | ErrorBoundary   | 10          | Utility/content   |
| 7    | NeonSign        | 10          | Visual/decorative |
| 8    | Sidebar         | 10          | Navigation/layout |
| 9    | Navbar          | 9           | Navigation/layout |
| 10   | Ferrofluid      | 8           | Visual/decorative |
| 11   | FlipDot         | 8           | Visual/decorative |
| 12   | ContextMenu     | 7           | Navigation/layout |
| 13   | SilkFlow        | 7           | Visual/decorative |
| 14   | TimePicker      | 7           | Form controls     |
| 15   | Tree            | 7           | Data display      |
| 16   | WatchLoader     | 7           | Feedback/overlay  |
| 17   | NavigationMenu  | 6           | Navigation/layout |
| 18   | Toast           | 6           | Feedback/overlay  |
| 19   | DateRange       | 5           | Form controls     |
| 20   | SplitScreenExit | 5           | Utility/content   |
| 21   | AppBar          | 0           | Navigation/layout |
| 22   | DateRangePicker | 0           | Form controls     |
| 23   | ImageUpload     | 0           | Form controls     |
| 24   | ThemeToggle     | 0           | Form controls     |

`DepartureBoard` and `DropdownMenu` (18 uses each) are now the highest-value uncovered
components — a transit-style "Live Departures Board" template (`DepartureBoard`,
pairing naturally with the existing TapeChart/Chalkboard restaurant-reservations-board)
or a "Right-Click Actions" template (`DropdownMenu`, `ContextMenu`) are the strongest
candidates for the next template pick.

### Grouped by category (for issues 3/5 and 4/5 to split against)

**Data display (2):** DepartureBoard, Tree — e.g. a transit-style "Live Departures
Board" template (DepartureBoard — pairs naturally with the existing TapeChart/
Chalkboard restaurant-reservations-board), a "Directory / File Browser" template
(Tree).

**Visual/decorative (5):** Letterboard, NeonSign, Ferrofluid, FlipDot, SilkFlow — the
catalog's animated/novelty display components (siblings of the already-covered
Odometer/SplitFlap/Chalkboard/TapeChart, and now Handshake). A "Brand Showcase" or
"Storefront Sign" template could plausibly reach for several of these at once
(NeonSign, FlipDot, Ferrofluid, SilkFlow); Letterboard reads as a vintage
diner/marquee motif and could fit a "Retro Menu Board" or "Daily Specials" template.

**Feedback/overlay (2):** WatchLoader, Toast — e.g. a "Background Job Status"
template (WatchLoader, Toast for completion notices).

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

Total: **20 components** across the five groups above. `ScrollArea`, `ChatPanel`,
`ErrorBoundary`, and `SplitScreenExit` (ranks 3, 5, 6, 20 in the table above) are the
4 uncovered components this grouping has never sorted into a category across any
audit pass — 20 + 4 = 24 uncovered in total, matching the ranked table. A follow-up
batch should not feel obligated to cover all 24 in two issues; splitting by
usage-rank (top 12 / bottom 12 from the ranked table) or by category (above) are both
reasonable ways for issues 3/5 and 4/5 to divide this list.

## Closed by batch 5 (#5526)

Ranks 1–3 of the table above are closed by the three templates batch 5 adds
(#5522, #5523, #5524), which land in the same pull request as this note. They are
**not** yet reflected in the coverage table or the ranking above — the next
regeneration is where they flip to `**Yes**`.

| Rank | Component   | Usage | Template added (`id`)   | Category     | Issue |
| ---- | ----------- | ----- | ----------------------- | ------------ | ----- |
| 1    | `DataList`  | 220   | `record-detail-panel`   | Data Display | #5522 |
| 2    | `Handshake` | 61    | `integration-handshake` | Feedback     | #5523 |
| 3    | `Dialog`    | 46    | `modal-form-dialog`     | Forms        | #5524 |

Each prompt names its target component literally, so none of the three repeats the
"keyword appears but the component isn't really implied" ambiguity that
§ PageHeader ambiguity documents.

Two notes on the picks:

- `record-detail-panel` asks for a striped label-and-value **spec sheet**, matching
  `DataList`'s documented purpose ("a definition list of key-value pairs… for spec
  sheets, metadata panels"). The directory/roster shape #5522's text suggested is
  already served by `team-directory` and would not reach `DataList`.
- `modal-form-dialog` is the "generic Modal Form template (Dialog, distinct from the
  confirmation-flow use already covered by ConfirmDialog)" this document proposes in
  § Grouped by category. It deliberately avoids the phrase "confirmation dialog", so
  the steer cannot be re-credited to `ConfirmDialog` the way the existing
  `settings-modal-flow` and `delete-confirmation-flow` prompts were.

Gallery size after batch 5: **35** templates. `DropdownMenu` (rank 5) was drafted and
then dropped in favour of `Dialog` once this regeneration landed and ranked `Dialog`
third — it remains uncovered and is the obvious rank-shifted candidate for batch 6.
