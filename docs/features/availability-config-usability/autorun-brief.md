# Autorun brief: availability-config-usability

Collected 2026-11-03 from Matt, live, in the session that ran `autorun` on the
goal "make availability configuration easier to use". This is not a pipeline
artifact.

Matt gave the answers marked **(Owner)** live. The orchestrator drafted
everything else from repo evidence. Matt accepted the Idea inputs as drafted.
Any item marked **[orchestrator default]** was not answered live, so the stage
that relies on it logs it under `assumptions:`.

## Run

- **Scale:** feature run. The slug is `availability-config-usability` (Owner
  accepted it) and the directory is `docs/features/availability-config-usability/`.
  The run enters at Idea.
- **Origin:** Matt's goal on 2026-11-03. He chose the scope (Scope A below)
  live, after a code double-check. It is not a backlog seed, so nothing is
  claimed in `docs/backlog.md`.
- **Worktree / branch:** `.claude/worktrees/availability-config-usability`,
  branch `feat/availability-config-usability`, cut from `origin/main` @
  `106eaaf9c`. It has no upstream until Ship. Never use the main checkout: it
  holds Matt's uncommitted work.
- **Predecessor run:** `docs/features/venue-availability/` built the
  availability system. Its 13 PRs merged on 2026-10-26. Its Ship is `prepared`,
  with the Owner-only steps not run.
  - Its `ux.md` is the current availability UX spec: F1/S1 quick setup, F11
    regular week, F-UW Change regular week.
  - Its `prd.md` holds the setup-time bars.
  - This run builds on those artifacts and never edits them.

## Idea inputs (drafted from evidence; Owner: "Accept as drafted")

- **Problem, in the Manager's words:** "My week isn't uniform. Lunch on
  weekdays, brunch at weekends, a later close on Friday and Saturday. Setup
  makes every service run on the same days, so I finish with the wrong week and
  then have to learn schedules and assignments on another tab to fix it."
- **Who has it, and how they cope:** a venue Manager who is setting up a new
  venue's availability or changing its regular week. Today the Manager sets the
  uniform part in quick setup. Then, on the Schedules tab, they create one more
  schedule for each distinct set of hours and assign it weekdays. Migrated
  venues get day-named schedules such as "Thu–Fri hours" (#7739).
- **Why now:** the availability system shipped on 2026-10-26, and no real
  restaurant uses it yet (venue-availability `idea.md:79`: "No real-venue
  evidence"). The production backfill has not run (venue-availability
  `release.md`, Owner, 2026-11-03), so no production venue holds migrated
  day-named schedules yet. Changing setup now, and the model if it needs to
  change, costs the least.
- **Evidence (anecdotes, labelled):**
  - **Code**, verified 2026-11-03 on `origin/main` @ `106eaaf9c`:
    - `apps/hospitality/src/components/availability/quick-setup-draft.ts`.
      Lines 24-26 describe "a regular week of services that all run on the
      same days". Lines 40-42 hold one `days` list for the whole draft. Line
      294 builds "one regular schedule, one assignment, one row per service".
    - `packages/types/src/schemas/availability-config.ts`. At lines 138-143,
      `ScheduleServiceSchema` has no weekday field. At lines 145-152,
      `ScheduleAssignmentSchema` maps weekdays to a whole schedule.
    - `apps/hospitality/src/components/availability/ChangeRegularWeekDrawer.tsx:47-49`.
      The drawer covers the days the regular week runs on. Days that another
      schedule runs keep that schedule's hours.
    - `apps/hospitality/e2e/availability-quick-setup.spec.ts:93` covers only
      the uniform bistro week. No e2e covers a varied week.
  - **Filed by the Owner:** #7738 (2026-10-26), "one regular schedule cannot
    hold different hours per weekday". The Owner deferred it on 2026-10-27:
    "Revisit after #7493 Phase 1 closes". The data-model answer below lifts that
    deferral for this run.
  - **Bar never measured:** venue-availability `prd.md` sets "Setup time,
    small … ≤5 minutes" for the uniform bistro week. Its `release.md` records
    "Setup time, small … NOT RUN".
  - **Count:** 2 reports, both written by the Owner: #7738, and the 2026-10-31
    availability audit (#7981, #7983, #7984). There are 0 reports from
    independent operators.
  - **Market:** from venue-availability `idea.md`, partly search excerpts.
    Every platform checked ships shifts and a weekly template as table stakes:
    Resy, OpenTable, Tock, Toast, SevenRooms, ResDiary, Eat App and TableCheck.
- **Solution hunch (not a design):** quick setup and Change regular week carry
  per-day differences directly, and the calendar shows the result as one
  regular week.
- **Success, in one sentence:** "A manager sets up lunch Mon–Fri, dinner
  Tue–Sun closing later Fri–Sat, and brunch Sat–Sun, from an empty venue, in ≤5
  minutes without help text, and the calendar shows it as one regular week."
- **Biggest unknowns, or ways this dies:**
  - Whether the data model must change (#7738). The candidates are a weekday
    scope on `ScheduleService` or a per-weekday hours payload. A change means a
    Prisma migration, an ADR-030 amendment, and a second data migration for
    venues already backfilled. It also touches `validateConfig`, `resolveDay`
    and `legacy-projection`.
  - The only testers are the Owner and agents. There is no real operator.
  - How the change interacts with History/Undo, the preview, Tonight changes
    and the agent's availability chat tools (#7920).
  - A richer setup could make the uniform bistro week slower.

## Scope (Owner: Scope A, 2026-11-03)

- **In:**
  - Quick setup lets a Manager give services different days, and give a day
    different hours, in one pass. Quick setup is the S1 card:
    `AvailabilityQuickSetup`, `QuickSetupForm`, `QuickSetupHoursStep` and
    `quick-setup-draft.ts`.
  - Change regular week lets a Manager change one weekday's hours without
    creating a schedule.
  - The calendar, the day drawer and the guest preview show the result as one
    regular week.
  - Any model, engine or API change Architect finds the above needs (see
    Decisions).
- **Out (the Owner chose A over these):**
  - The leftovers from the 2026-10-31 audit:
    - #7981: Also apply to, the Services filter, Close for several dates, and
      Remove/Edit for dated-schedule layers.
    - #7984 criterion 2: edit a closure.
  - #7983's leftovers: the guest language of closure notices, and rebooking
    times in the preview.
  - Group cascade and self-tuning (backlog line 286), and external listing
    sync.
  - venue-availability's Owner-only release steps: migration confirmation,
    backfill, p95 and the walkthrough. They belong to that run.
  - Re-timing the large multi-room setup bar (≤15 min) as a criterion
    **[orchestrator default]**. It must not get slower.

## Success criteria

These are derived from the accepted success sentence **[orchestrator
default]**. PRD sharpens them and logs under `assumptions:` any criterion it
adds.

- The varied week in the success sentence can be entered entirely in quick
  setup, with no visit to the Schedules tab (e2e).
- After save, each weekday resolves to the services and hours entered, in the
  calendar, the day drawer and the guest preview (engine, component and e2e
  tests).
- Change regular week changes one weekday's hours and leaves the other
  weekdays unchanged (e2e).
- The uniform bistro week takes no more interactions than it does today. The
  existing `availability-quick-setup.spec.ts` case keeps passing.
- The varied week takes fewer interactions than today's path (quick setup,
  then the Schedules tab). Both paths are counted by the same scripted e2e on
  the same fixture. This is agent stand-in evidence. The Owner's human-timed
  ≤5 min walkthrough is listed as an Owner-only post-release check and never
  claimed.
- New copy ships in en-US, es-MX and fr-CA (repo convention; #7981's
  acceptance).
- The existing availability unit and e2e suites stay green, and the engine's
  property test still holds: no slot is offered outside resolved availability.

## Decisions already made

- **Data model (Owner): "Architect decides".** The #7738 model change is
  allowed: a weekday scope on `ScheduleService`, a Prisma migration, an
  ADR-030 amendment, and re-migrating already-backfilled venues.
  - Architect picks the smallest design that meets the scope and logs why.
  - A UI-only design on today's model is allowed if it meets the success
    criteria.
  - Any ADR written here has status `provisional`.
- **Repo conventions bind** (AGENTS.md and `.github/copilot-instructions.md`):
  - immutability and functional React;
  - CSS Modules with Rialto tokens, with no Tailwind and no inline styles;
  - Zod at service boundaries and RFC 7807 errors;
  - the repository pattern;
  - no `console.log` and no `any`.
- **Active ADRs bind:** ADR-029 (the reservation date is the service day) and
  ADR-030 (availability layered rows, pure engine).

## Constraints

- **TDD.** Write a RED test first for each behaviour. Keep the existing
  availability tests green:
  - `packages/availability`;
  - the availability config and preview tests in `services/reservations`;
  - the availability component tests in `apps/hospitality`;
  - the e2e `apps/hospitality/e2e/availability-*.spec.ts`.
- **Any Prisma migration:**
  - goes in a new folder under `services/reservations/prisma/migrations/`,
    with a tested forward path;
  - never runs against a real or production database;
  - the legacy migration and backfill path (`backfill-availability.ts`,
    `legacy-projection`) must produce the new shape.
- **Repo gotchas:**
  - `set -o pipefail` in shell pipelines;
  - no shell variable named `status`;
  - stage explicit paths only;
  - never pipe `git push`, and never use `--no-verify`;
  - format docs with prettier.
- **Repo pipeline hook:** run the `.claude/skills/local-ci-precheck/SKILL.md`
  steps before the first push and at Ship pre-flight.

## Tracker (Owner: "Seed matching issues")

- #7738 seeds the run. Its work item or items carry `(tracker: #7738)` in the
  breakdown.
- **Closing (Owner accepted the option text "Implement closes an issue only
  when its item fully covers it"):**
  - Implement closes #7738 with `gh issue close` when it checks off the items
    that mirror it, and only if they fully cover the issue. Full coverage
    includes collapsing migrated day-named schedules into the regular week
    (the issue's "What this issue is for"). The closing comment names the run
    directory and the branch. Otherwise #7738 stays open.
  - The Ship PR body says `Closes #7738` when the run fully covers it, and
    `Refs #7738` otherwise.
  - No other issue interaction: no comments, label changes or closes on any
    other issue.
- #7493, #7981, #7983 and #7984 are context only and stay untouched.

## UX

This work has a user-facing surface: the hospitality Manager's availability
setup (the quick setup card, Change regular week and the calendar). So
`ux: required`. The orchestrator told the Owner this on 2026-11-03 and the
Owner did not object.

## Release authorization (Owner, 2026-11-03)

Prepare and stop.

- Ship opens the run's PR or PRs (code plus run artifacts), records
  `outcome: prepared` with `pending-merge:`, and stops.
- Matt reviews and merges. The run does no merge, auto-merge, deploy, publish,
  tag, migration apply, backfill or workflow dispatch.
- Never ship past an unfixed critical review finding.

## Operate (Owner)

operate: skip. No venue uses availability yet, so a retro would count 0. The
run stays active after Ship until someone has feedback to capture.

## Standing instructions to every stage subagent

- Load the stage skill from the installed plugin:
  `/Users/mbutler/.omp/plugins/node_modules/idea-to-prod/skills/<stage>/SKILL.md`
  (v0.24.0) and its `TEMPLATE.md`. Do not use the older 0.12.2 cache. The
  protocol is `/Users/mbutler/.omp/plugins/node_modules/idea-to-prod/docs/pipeline-protocol.md`.
- Answer interview questions from this brief. Where it is silent:
  - If the stage skill offers named options with a recommended default, take
    the default and log it under `assumptions:` in the artifact's frontmatter.
  - Otherwise, stop and surface. Never guess, and never answer an evidentiary
    question yourself.
- Never fabricate verification evidence. Run the repo's real commands and
  quote their output.
- End the stage by committing its own artifact on
  `feat/availability-config-usability`, as one commit with the subject
  `docs(availability-config-usability): <stage> — <one line>`.
- GitHub is read-only until Ship, apart from Implement closing #7738 (see
  Tracker). No other issue or PR comments, and no label changes.
- **Ambition ladder (Idea):** the Owner did not answer it, so the skill's
  recommended default applies **[orchestrator default]**. Take Showstopper,
  run its four tests, and make Solid the pick only through the skill's own
  demotion rule.

## Pre-flight record (2026-11-03, before the first stage)

- **Open PRs, oldest first.** None touches availability.
  - #8157: the chaos synthetic bug. Red by design (`Test (Node 22,
hospitality)`, `CI Gate`). Never to be merged; surfaced to close.
  - #8227: the gen e2e for #8199. Red on `Gen E2E` (`toBeFocused` at 600px).
    The drain session handed it to the Owner (`needs-review`). Blocked on a
    product call this run does not own.
  - #8230: scripts, metrics freshness (drain #8204). Green, no review
    decision. Presented for the Owner's merge.
  - #8231: the tier-gate-pr-head-code Ship write-back from this session.
    Green. Presented for the Owner's merge.
  - #8232: scripts, review_coverage_trend (drain #8186). Checks still running;
    the drain session is driving it.
- **Work in flight:** checked, and nothing matches.
  - No open PR touches availability.
  - Of the 14 availability worktree branches, 11 map to merged PRs (#7553,
    #7558, #7599, #7616, #7672, #7739, #8027, #8034, #8037, #8048, #8051).
  - Two have no PR and no patch missing from `main`
    (`fix/availability-history-actor-name`, `-names`).
  - `closure-fixes` (2026-10-25) has no PR. It carries closure-command
    internals that #7600 and #7785 superseded [INFERENCE].
  - No branch claims #7738.
