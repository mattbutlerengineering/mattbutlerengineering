# Autorun brief: availability-setup-hierarchy

Collected 2026-11-07 from Matt, live, in the session that ran `autorun` with no
feature named. Matt chose to start a new run and gave the goal below. This is
not a pipeline artifact.

Matt gave the answers marked **(Owner)** live. The orchestrator drafted
everything else from repo evidence read on `origin/main` @ `7c051456f`, and
Matt approved the drafted brief as a whole before the first stage. Any item
marked **[orchestrator default]** was not answered one by one, so the stage
that relies on it logs it under `assumptions:`.

## Run

- **Scale:** feature run. Slug `availability-setup-hierarchy`, directory
  `docs/features/availability-setup-hierarchy/`. The run enters at Idea.
- **Origin:** Matt's goal on 2026-11-07, in his words: "As a user, I am
  confused about how to set up availability. Having clearer UX for different
  resource types and hierarchy of resources would make it easier for me to
  follow. I want to simplify the UX without sacrificing usability." Not a
  backlog seed; nothing is claimed in `docs/backlog.md`.
- **Worktree / branch:** `.claude/worktrees/availability-setup-hierarchy`,
  branch `feat/availability-setup-hierarchy`, cut from `origin/main` @
  `7c051456f`. Never use the main checkout: it holds Matt's uncommitted work.
- **Predecessor runs** (read-only; this run never edits them):
  - `docs/features/venue-availability/` — built the availability system
    (Phase 1, merged 2026-10-26). Its `ux.md` is the current availability UX
    spec and names Phases 2–5 (holidays, areas/sections, pacing, policies,
    events) as later runs. Its Ship is `prepared`; the Owner-only steps
    (migration confirm, backfill, production checks) are still not run.
  - `docs/features/availability-config-usability/` — released 2026-11-04
    (#8237): per-day hours in quick setup and a live guest-view strip
    (ADR-031). Its Owner-only post-release checks (timed walkthrough,
    collapse script) are not run.

## Idea inputs (drafted from evidence; Owner approved the brief as drafted)

- **Problem, in the Manager's words (Owner, 2026-11-07):** "I am confused
  about how to set up availability. I can't see what kinds of things I'm
  configuring or how they fit together, so I don't know where to go to change
  something."
- **Who has it, and how they cope:** the venue Manager setting up a venue or
  changing it later. Today the things a Manager configures live on separate
  surfaces with no screen that shows how they relate: the `/setup` checklist
  (onboarding → operating hours → floor plan → launch), `/availability`
  (Calendar | Special dates | Schedules tabs, quick setup, Change regular week,
  Tonight), and `/floor-plans` (sections and tables). They cope by trial:
  opening each page until they find the control.
- **Why now:** availability shipped 2026-10-26 and per-day hours on
  2026-11-04; no real venue uses it yet and the production backfill has not
  run (venue-availability `release.md`). An information-architecture change
  costs least before operators learn the current layout.
- **Evidence (anecdotes, labelled):**
  - **Count (Owner, 2026-11-07): 1 report, the Owner's own. 0 independent
    operators.** Nothing is validated.
  - **Code**, verified 2026-11-07 on `origin/main` @ `40f0f7f`:
    - `apps/hospitality/src/components/DashboardLayout.tsx` `ROUTE_LABEL_KEYS`:
      `floor-plans`, `availability`, `setup` and `hours` are four separate
      routes/labels for one setup activity.
    - `apps/hospitality/src/pages/SetupPage.tsx` `STEP_CONFIG`: steps
      `onboarding`, `operating-hours`, `floor-plan` — the checklist orders the
      resources but hands off to three unrelated pages.
    - `apps/hospitality/src/components/availability/AvailabilityScheduleControls.tsx:37`:
      the Schedules tab renders only when `hasOwnSchedules(state.config)` or
      the tab is already selected, so a one-schedule venue never sees the
      venue → schedule → service nesting that the model uses.
    - `services/reservations/prisma/schema.prisma`: availability resources
      are `Schedule` (`regular|alternate|holiday`) → `ScheduleService` →
      `VenueService`, plus `DateRule` with
      `targetKind ∈ {venue, service, booking, tables}` and `DateRuleTable`.
      Line 658: "`sectionId` (P3) is deliberately absent". Physical resources
      (`FloorPlan → FloorPlanSection → Table`) are defined on `/floor-plans`
      but blocked from Tonight and the day drawer.
    - Hours are editable from the onboarding `OperatingHoursStep`,
      `AvailabilityQuickSetup`, `ChangeRegularWeekDrawer`, the Schedules tab
      and Copy-day actions — five entry points to one concept
      [scout read on a stale checkout; Idea re-verifies on `origin/main`].
  - **Prior-run deferrals that touch this:** venue-availability `ux.md`
    "Flows: Phases 2–5" (areas/sections F15); availability-config-usability
    PRD "Out of scope" (nothing about IA).
  - **Open issues:** none about availability setup UX (`gh issue list
--search "availability in:title"` → only #7493 tracking). All
    venue-availability follow-ups (#7682–#7706) and the 2026-10-31 audit
    issues (#7981, #7983, #7984) are CLOSED.
- **Solution hunch (not a design):** one setup surface that names each
  resource type (hours/schedules, services, special dates, sections/tables,
  booking channels) and shows how they nest, with today's editors re-homed
  under it rather than rebuilt.
- **Success, in one sentence [orchestrator default]:** "A new Manager, from
  an empty venue and without help text, can say what each resource type is
  and where to change it, and sets up a two-service varied week plus one
  section blocked for one date in ≤5 minutes." (The ≤5 min bar is the
  venue-availability PRD's small-setup bar, reused; PRD may sharpen it.)
- **Biggest unknowns, or ways this dies:**
  - Whether an IA change can be done on the existing model, or whether a
    visible hierarchy needs a model change (e.g. section-level rules, which
    the schema deliberately omits).
  - The only tester is the Owner. No independent operator.
  - Route changes break bookmarks, the `/setup/hours` redirect
    (`main.tsx`), the onboarding wizard's hand-offs, and the e2e suites
    (`apps/hospitality/e2e/availability-*.spec.ts`, `onboarding.spec.ts`).
  - "Simplify" could hide controls power users need (Compare services,
    Tonight, History).

## Scope (Owner, 2026-11-07)

- **In:**
  - **Resources covered:** the time structure (regular week/schedules,
    services, special dates/closures, booking channels) **and** the physical
    resources (floor-plan sections and tables) as they relate to
    availability — where they are defined versus where they are blocked.
  - **IA redesign allowed:** UX may propose a new setup hub / navigation
    structure (for example one "Venue setup" area listing resource types and
    their nesting) and re-home `/availability`, `/floor-plans`, `/setup` and
    `/setup/hours` under it. Existing editors are reused where they fit.
  - Clearer naming of resource types across the surfaces (one term per
    concept; see venue-availability `ux.md` "Voice & terms").
  - Any model, engine or API change Architect finds the above needs (see
    Decisions).
- **Out:**
  - New section/area-level availability rules (venue-availability Phase 3)
    unless Architect proves the IA cannot show the hierarchy without them.
  - Holidays, pacing/turn times, policies, events (Phases 2, 4, 5).
  - Menus and the booking widget as resources (separate nav; untouched).
  - venue-availability's and availability-config-usability's Owner-only
    post-release steps. They belong to those runs.
  - External listing sync, group cascade.

## Success criteria

Derived from the success sentence **[orchestrator default]**. PRD sharpens
them and logs under `assumptions:` any criterion it adds.

- Every resource type in scope is reachable from one setup surface that shows
  its parent/child relation (venue → schedules → services; venue → floor plan
  → sections → tables; date overrides and their targets). Component + e2e.
- Each resource type has exactly one primary editor; secondary entry points
  (onboarding step, Tonight, day drawer) link to it rather than duplicating
  it. Counted by a scripted e2e on the same fixture before and after.
- The varied-week scenario from availability-config-usability
  (`availability-quick-setup.spec.ts`) takes no more interactions than today.
- Old routes keep working: `/availability`, `/floor-plans`, `/setup/hours`
  resolve (redirect or render) and the `/setup` readiness redirect still
  bounces an unready venue. e2e.
- Hosts (view-only role) see no editor they cannot use.
- New copy ships in en-US, es-MX and fr-CA.
- Existing availability, floor-plan and onboarding unit/e2e suites stay
  green; the engine property test still holds.

## Decisions already made

- **Data model (Owner): "Architect decides".** A schema change is allowed if
  the IA needs it; Architect picks the smallest design that meets scope and
  logs why. A UI-only design on today's model is preferred when it meets the
  criteria. Any ADR written here has status `provisional`.
- **Delivery shape [orchestrator default]:** Implement builds one branch and
  PR per breakdown item off `main` (worktree workers), as venue-availability
  did; each item PR merges under the release authorization below once a
  reviewer pass returns no fail/flag verdict and `CI Gate` is green. Run
  artifacts commit on `feat/availability-setup-hierarchy` and merge via the
  Ship PR.
- **Repo conventions bind** (AGENTS.md, `.github/copilot-instructions.md`):
  immutability and functional React; CSS Modules with Rialto tokens, no
  Tailwind, no inline styles; Zod at boundaries and RFC 7807 errors;
  repository pattern; no `console.log`, no `any`.
- **Active ADRs bind:** ADR-029, ADR-030, ADR-031.

## Constraints

- **TDD.** RED test first per behaviour. Keep green: `packages/availability`;
  availability/floor-plan tests in `services/reservations`; availability,
  floor-plan and venue-onboarding component tests in `apps/hospitality`; e2e
  `apps/hospitality/e2e/availability-*.spec.ts`, `onboarding.spec.ts`,
  floor-plan specs.
- **Any Prisma migration:** new folder under
  `services/reservations/prisma/migrations/`, tested forward path, never run
  against a real database by this run; the backfill path must produce the new
  shape.
- **Repo gotchas:** `set -o pipefail`; no shell variable named `status`;
  stage explicit paths only; never pipe `git push`; never `--no-verify`;
  prettier on docs.
- **Repo pipeline hook:** run `.claude/skills/local-ci-precheck/SKILL.md`
  before the first push of each PR and at Ship pre-flight.

## Tracker (Owner: mirror breakdown items to issues, no `ready` label)

- No seed issue exists. Decompose publishes one tracking issue
  `availability-setup-hierarchy: <title> (tracking)` with labels `feature`,
  `tracking`, and one issue per work item, none with `ready`; the mapping is
  recorded in `breakdown.md` as `(tracker: #N)` per item.
- Implement closes an item's issue when it checks the item off and only if
  the item fully covers it; closing comment names the run directory and PR.
- PR bodies say `Part of #<tracking>`; the Ship write-back closes the
  tracking issue.
- No other issue interaction (no comments, labels, closes elsewhere).

## UX

User-facing surface: the hospitality Manager's setup navigation and
availability/floor-plan pages. `ux: required`.

## Release authorization (Owner, 2026-11-07)

**Authorized: Ship may merge.** Each item PR and the Ship PR may be merged by
this run once a reviewer subagent passes it and `CI Gate` is green on the
exact head:
`gh pr merge <N> --squash --subject "<title> (#<N>)" --match-head-commit <sha>`.
CI then deploys (static sites, services, Pulumi). Ship verifies each deploy at
**job** level, not by the workflow rollup, runs the post-release checks, and
writes `outcome: released` with `released-at:` back through a docs-only PR it
may also merge once `CI Gate` is green.

Never merge past an unfixed critical review finding. Still forbidden:
`--admin`, workflow dispatches, any by-hand write to a production database
(backfills, collapse scripts), tags, label changes outside the tracker rules.

## Operate (Owner, 2026-11-07)

operate: skip. The only user is the Owner, so a retro would count 0. The run
stays active after Ship until someone has feedback to capture.

## Standing instructions to every stage subagent

- Load the stage skill from the installed plugin:
  `/Users/mbutler/.omp/plugins/node_modules/idea-to-prod/skills/<stage>/SKILL.md`
  and its `TEMPLATE.md`. The protocol is
  `/Users/mbutler/.omp/plugins/node_modules/idea-to-prod/docs/pipeline-protocol.md`.
- Work only in `.claude/worktrees/availability-setup-hierarchy` (artifacts)
  and per-item worktrees under `.claude/worktrees/` (Implement). Read code
  from there, never from the main checkout.
- Answer interview questions from this brief. Where it is silent: if the
  stage skill offers named options with a recommended default, take the
  default and log it under `assumptions:` in the artifact's frontmatter;
  otherwise stop and surface. Never guess an evidentiary answer.
- Never fabricate verification evidence. Run the repo's real commands and
  quote their output.
- End the stage by committing its own artifact on
  `feat/availability-setup-hierarchy` as one commit:
  `docs(availability-setup-hierarchy): <stage> — <one line>`. Stage explicit
  paths; let the pre-commit hook stage regenerated `llms*.txt` if it does.
- GitHub is read-only until Decompose's tracker export, Implement's item PRs
  and issue closes, and Ship's merges, all as this brief allows.
- **Ambition ladder (Idea) [orchestrator default]:** take the skill's
  recommended default, run its tests, demote only by the skill's own rule.

## Pre-flight record (2026-11-07, before the first stage)

- **#8470** `docs(venue-availability): autorun — brief resume 2026-11-07
(operate: skip)`: `state: OPEN`, `mergeable: MERGEABLE`, `CI Gate` SUCCESS
  on head `11d69f56376fa3febb9455176cf69cbaf59cf54d`, no non-green checks.
  Merged by the orchestrator under the venue-availability authorization:
  `gh pr merge 8470 --squash --match-head-commit 11d69f5…` → `MERGED`,
  `mergedAt: 2026-11-07T22:24:45Z`, merge commit `7c051456f`. That merge
  commit is this run's `origin/main` base.
- **Other open PRs** (`gh pr list --state open --json
number,title,mergeable,statusCheckRollup,reviewDecision`), all
  `MERGEABLE`, no failing or pending checks, no approvals; none belong to this
  run, so none were merged (a green PR waits for the Owner):
  - #8468 `docs: operate — close 21 released runs (retros + 122 seeds)` —
    `CI Gate` SUCCESS.
  - #8467 `refactor(reservations): the closure command returns its
post-commit plan` — `CI Gate` SUCCESS.
  - #8465 `chore(automation): retire the never-firing revert-rca-detection
workflow` — `CI Gate` SUCCESS.
  - #8461 `chore(metrics): learning-loop 2026-11-07` — `CI Gate` SUCCESS.
  - #8460 `chore: version packages` — no `CI Gate` check; CodeQL, Trivy and
    Analyze jobs SUCCESS.
- **Work-in-flight check:** `git fetch origin --prune; git branch -r | grep
-iE 'availab|setup-hub|hierarch'` →
  `origin/docs/venue-availability-autorun-2026-11-07` (#8470's branch, now
  merged) and `origin/fix/availability-drawer-diffs` (#7599, MERGED
  2026-10-25). `gh pr list --state all --search "availability setup hierarchy
in:title"` → `[]`. Outcome: **no work in flight**; nothing builds a setup
  hub or resource hierarchy. The run starts fresh at Idea.
