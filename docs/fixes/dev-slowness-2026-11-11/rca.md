# RCA: development feels slow (2026-11-11)

## Question

Why does it take so long to get from an idea to a shipped feature, and why does product progress feel slow?

## Short answer

The pipeline is fast. PRs merge 0-3 hours after opening and PR CI takes about 10 minutes. The capacity goes to the factory maintaining itself and to features that never reach a declared "done". Only 15% of merged PRs are features.

## Evidence

Measured with `node scripts/work-mix-report.mjs --since 2026-10-28` plus the `gh` queries below.

| Signal                                     | Value                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Merged PRs since 10-28 (553)               | 33% chore, 33% fix, 15% feat, 10% test, 7% docs                                     |
| Last 100 merged PRs                        | 37 chore, 29 fix, 14 feat                                                           |
| Chore commits on main since 10-28          | 131 of 553 commits (24%) are bot metric or ledger writes; 17 are `version packages` |
| Issues closed since 10-28                  | 60 `feature`, 58 `ci-fix`, 27 bug, 24 audit, 13 sentry                              |
| Availability commits since 10-28           | 28 feat, 44 fix; tracking #7493 open 17.5 days                                      |
| Open tracking issues older than 10 days    | #7074 menus (24 d), #7257 eat-sheet (21 d), #7493 availability (17.5 d)             |
| Concurrent product runs                    | Availability audit, The Invitation (#8670), On My Way (#8654), eat-sheet, menus     |
| `ci.yml`, last 100 runs                    | 53 success, 20 cancelled, 10 failure, 11 action_required                            |
| PR CI wall time (5 recent successful runs) | 9-12 minutes; the first job starts within 1 minute                                  |

## Root causes, ranked by capacity lost

1. **The factory maintains itself at product cost.** `ci-fix` closures (58) match `feature` closures (60). Monitors for dark routines, sdlc-speed regressions, API p95 and visual drift each file issues, and the queue works them like product work. Bot metric and ledger writes add 131 commits to `main` in the same window. (#8728 looked like a self-caused loop but was not: the snapshot data is fixture-mocked, and the failure came from a rendering change merged without a baseline regen.)
2. **Features have no exit criteria.** Availability shipped, then UX audits on 10-31 and 11-11 each produced 10-40 fix PRs. An audit always finds more polish, so the tracking issue never closes.
3. **Breadth over depth.** Daily `/ideate` and `mbe-feature-drain` start new features (The Invitation, On My Way) while availability is still open. Work in progress spreads across about five product runs.
4. **Owner-only tails block "shipped".** Tracking issues stay open 17-24 days on a single Owner step, such as a teardown or a backfill.
5. **Minor: CI supersession.** 20% of `ci.yml` runs are cancelled because a newer push replaced them. This costs runner minutes, not calendar time.

PR size, CI duration and review-gate speed are not root causes.

## Countermeasures

Filed as issues for the Owner to decide. None is labelled `ready`.

- RC1 (#8741): cap self-generated work.
- RC2 (#8742): a "done" definition fixed at decompose time; later audit findings go to a separate polish issue.
- RC3 (#8743): a product WIP limit of two runs for `/ideate` and `mbe-feature-drain`.
- RC4 (#8744): close a tracking issue when its product work ships, and split the Owner-only tail into its own issue.

## Success check (re-run on 2026-11-25)

- Feature share of merged PRs above 15%.
- `ci-fix` closures below half of `feature` closures.
- No product tracking issue open longer than 10 days.

## Reproduce

```sh
node scripts/work-mix-report.mjs --since 2026-10-28
gh run list --workflow ci.yml --limit 100 --json conclusion --jq 'group_by(.conclusion) | map({c: .[0].conclusion, n: length})'
git log origin/main --since=2026-10-28T00:00:00Z --format=%s | grep -cE '^chore(\((metrics|acmm)\)|: (record|update) .*(metrics|rows))'
```

## Not measured

- The Owner's own hours per change.
- Whether bot metric commits trigger CI runs or llms regen.
- GitHub search reads `merged:>=2026-10-28` as UTC, while a bare `git log --since=2026-10-28` uses local time. Counted in UTC, `main` has 553 commits for the 553 merged PRs.
