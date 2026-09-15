# Hospitality UX audit — routing record

Supporting file for run `feature:hospitality-service-ux` (not a protocol
artifact). Written 2026-09-03 by the routing worker after the consolidated
findings in `ux-audit.md` were ranked. Every finding is routed exactly once:
built by this run, a GitHub issue (`ready` + `audit` + `ux` unless noted), a
comment on the PR that already fixes it, or a `docs/backlog.md` seed. Issue
bodies carry the evidence, reproduction, fix sketch and regression test from
the matching `audit/<report>.md` section. Dedupe was run against every open
issue before filing; no duplicates were found (#4111, #4487, #4565, #4746,
#4848, #4944, #4967 were cited, not refiled).

| ID                                                        | Finding (short)                                                                                            | Route                               | Reference                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| A1–A10, B1, B2, B3 (hospitality half)                     | The service night on the Timeline; one voice for bad news; focus/announce on the hospitality dialogs       | **this run** (PRD scope)            | `ux-audit.md` § Cluster A / B                                                                    |
| B3 (rialto half)                                          | `useFocusTrap` focuses Close first, never restores; `Drawer` never restores; `initialFocus` + restore      | issue (rialto, changeset)           | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4970                       |
| B4                                                        | `/chat` renders outside `DashboardLayout`; failed send silent                                              | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4971                       |
| B5                                                        | 8/10 `EmptyState`s without `action`; ISO dates in empties; `path:"*"` → `/timeline` with no 404            | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4972                       |
| B6                                                        | One `document.title` for every route; only writer `LoginGate`                                              | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4973                       |
| C1                                                        | `/public/v1/*` returns the SPA's HTML on production (edge router proxies only `/api/`)                     | PR #4565 comment (not refiled)      | https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4565#issuecomment-5536071039 |
| C2                                                        | Venue-not-found "Go Back" → `about:blank`; no live venue slug resolves (human half recorded in the body)   | issue + human flag                  | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4974                       |
| C3                                                        | `VITE_STRIPE_PUBLISHABLE_KEY` absent from `deploy-static.yml` (prod build), not only the E2E job           | issue (`ready`+`audit`, refs #4111) | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4975                       |
| D1                                                        | Slot times in guest TZ, not venue TZ                                                                       | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4976                       |
| D2                                                        | Hold expiry wipes typed details                                                                            | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4977                       |
| D3                                                        | Confirmation "Cancel Reservation" inert; release-hold beacon never fires                                   | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4978                       |
| D4                                                        | Party cap hardcoded 8, "please call us" with no number; "~30 min" waitlist for a date days out             | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4979                       |
| D5                                                        | Manage-reservation page read-only, raw ISO timestamps, no actions                                          | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4980                       |
| D6                                                        | Booking widget phone targets 32–38 px, no default date, disabled CTA with no hint                          | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4981                       |
| E1                                                        | Operating hours unreachable once operational (`/setup*` redirect)                                          | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4982                       |
| E2                                                        | rialto `Select` listbox painted under the next `Card` (Theme "Dark" un-clickable by mouse)                 | issue (rialto, changeset)           | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4983                       |
| E3                                                        | Setup checklist "Review" opens a blank New Venue wizard                                                    | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4984                       |
| E4                                                        | Server-side theme preference written but never read                                                        | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4985                       |
| E5                                                        | Reservations list rows: invisible overlay action, raw `tbl_*` ids, no detail/edit/cancel                   | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4986                       |
| E6                                                        | Floor-plan editor `window.confirm` for Delete Table (sequenced behind the floor-plan run)                  | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4987                       |
| E7                                                        | Floor Plans card `<button>` nests Clone `<button>`; `.cardActions` opacity 0; clone error sr-only          | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4988                       |
| F1                                                        | 44 px tablet targets: `Button size="sm"` 23 px, `GlobalNav` 32 px, editor toolbar 28–30 px                 | issue (rialto, changeset, MED risk) | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4989                       |
| G1                                                        | Walk-in and waitlist never recognise a returning guest (`guestId` payload change)                          | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4990                       |
| M1                                                        | Floor-plan canvas hardcoded `#f8f6f3` grid in dark; Tailwind-blue focus rings; backlog claim false         | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4991                       |
| M2                                                        | `LapsingGuestsWidget` never mounted; `IMPROVEMENT-BACKLOG.md:14` claims a `useApiCall` hook that is absent | issue                               | https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4992                       |
| Harness promotion (`ux-walk` tool)                        | Commit the `.ux-audit/` walker with per-route assertions                                                   | backlog seed a                      | `docs/backlog.md` (from: feature:hospitality-service-ux)                                         |
| UTC-vs-local date class                                   | `toDateString` (UTC) vs local `en-CA`; A1, A2, D1 and the `todayReservations()` mock share it              | backlog seed b                      | `docs/backlog.md` (from: feature:hospitality-service-ux)                                         |
| `IMPROVEMENT-BACKLOG.md` truth                            | Two `[x]` lines the code contradicts; require grep-able claims                                             | backlog seed c                      | `docs/backlog.md` (from: feature:hospitality-service-ux)                                         |
| Suspicions (StrictMode focus, "Live" pill, Notify filter) | Not reproduced — one probe each before filing                                                              | backlog seed d                      | `docs/backlog.md` (from: feature:hospitality-service-ux)                                         |

## Notes

- Correction recorded while filing M2 (#4992): at `5f642aa42`,
  `apps/hospitality/CLAUDE.md` does **not** name `useApiCall`; its line 122
  says "Error recovery missing on most pages", which is stale in the opposite
  direction (`ErrorRetryBanner` is on 9 pages). `useApiCall` appears only in
  `docs/IMPROVEMENT-BACKLOG.md:14` and `:39`. The colours claim is
  `IMPROVEMENT-BACKLOG.md:20`, not `:21` as `ux-audit.md` says.
- C2's human half (no live venue slug; pairs with #4746's venue-hours step)
  and C3's human half (the publishable-key secret value) are recorded in the
  issue bodies, not tracked separately.
- E6 (#4987), E3 (#4984) and M1 (#4991) note the in-flight
  `venue-onboarding-floor-plan` run (#4751) touches adjacent files; E6 is
  explicitly sequenced behind that run's merge.
