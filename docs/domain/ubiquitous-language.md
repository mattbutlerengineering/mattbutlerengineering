# Ubiquitous Language

Canonical glossary of core domain terms used across services, packages, and docs.
Every entry is grounded in a real symbol cited as `path:symbol`.
Terms are grouped by bounded context (as mapped in [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md)).

> **Policy:** When naming a concept, use the term defined here.
> Do not use synonyms listed under "avoid" — they create ambiguity across package and service boundaries.

---

## 1. Hospitality / Reservations

Context covers `apps/hospitality`, `services/reservations`, `services/users`.

### Guest

**Definition:** A person who has visited or booked at a venue; the primary CRM entity tracking visit history, risk, and preferences.

**Source:** `packages/types/src/guest.ts:Guest`

**Key fields:** `noShowCount`, `riskScore` (`"trusted" | "standard" | "risky"`), `visitCount`, `lifetimeSpend`, `staffNotes`.

**Synonyms to avoid:** _customer_, _patron_, _diner_ — use **Guest** in code and docs.

---

### Reservation

**Definition:** A confirmed time slot at a specific table for a party, with a lifecycle of `PENDING → CONFIRMED → COMPLETED | CANCELLED | NO_SHOW`.

**Source:** `packages/types/src/reservation.ts:Reservation`, `packages/types/src/reservation.ts:ReservationStatus`

**Status values:** `"PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW"` — always uppercase.

**Key fields:** `partySize`, `date`, `startTime`, `endTime`, `tableId`, `guestId`, `status`.

**Related:** [Party Size](#party-size), [No-Show](#no-show), [Deposit](#deposit).

**Synonyms to avoid:** _booking_ (ambiguous — prefer **Reservation** in the DB/API layer; _booking_ is acceptable UI copy only), _appointment_.

---

### Table

**Definition:** A physical seating unit in a venue, with a real-time status (`AVAILABLE | OCCUPIED | DIRTY | READY`) that follows a strict state machine.

**Source:** `packages/types/src/reservation.ts:Table`, `packages/types/src/reservation.ts:TableStatus`

**State machine:** `AVAILABLE → OCCUPIED → DIRTY → READY → AVAILABLE`
(source of truth: `services/reservations/src/services/table-state-machine.ts`, declared in `packages/types/src/reservation.ts:TABLE_VALID_TRANSITIONS`)

**Key fields:** `capacity`, `minCovers`, `maxCovers`, `priority`, `status`, `floorPlanId`.

**Synonyms to avoid:** _seat_, _seating area_ — use **Table** for the bookable unit.

---

### Waitlist / WaitlistEntry

**Definition:** A queue of walk-in guests waiting for a table when the venue is fully occupied; each entry is a `WaitlistEntry` with status `waiting | notified | seated | expired | cancelled`.

**Source:** `services/reservations/prisma/schema.prisma:WaitlistEntry`, `services/reservations/prisma/schema.prisma:WaitlistStatus`

**Route prefix:** `POST /api/v1/waitlist` (registered in `services/reservations/src/app.ts:waitlistRoutes`)

**UI entry point:** `apps/hospitality/src/components/booking-widget/WaitlistJoinView.tsx`

**Synonyms to avoid:** _wait list_ (two words), _queue entry_ — use **WaitlistEntry** in code.

---

### Walk-in

**Definition:** A same-moment table request with no prior reservation; creates a `CONFIRMED` reservation immediately without the multi-step booking flow.

**Source:** `packages/types/src/reservation.ts:WalkInRequest`

**Key fields:** `partySize`, `tableId`, `venueId`, `durationMinutes`.

**Synonyms to avoid:** _drop-in_, _immediate reservation_ — use **walk-in** (hyphenated, lowercase) in copy; `WalkInRequest` in TypeScript.

---

### Deposit

**Definition:** A hold placed on a guest&apos;s payment method to secure a reservation; follows its own lifecycle (`pending | held | applied | refunded | partial_refunded | forfeited`).

**Source:** `packages/types/src/reservation.ts:Deposit`, `packages/types/src/reservation.ts:DepositStatus`

**Config:** `packages/types/src/venue.ts:DepositConfig` (type: `"flat" | "per_person"`, amount in cents).

**Auto-trigger:** configured via `packages/types/src/venue.ts:VenueSettings.autoDepositAfterNoShows` (default: 2 no-shows).

**Related:** [No-Show](#no-show), [Guest](#guest) (`riskScore`).

**Synonyms to avoid:** _payment hold_, _pre-authorization_ — use **Deposit** in code and UI.

---

### Booking Widget

**Definition:** The embeddable public-facing React component that drives the guest-facing reservation flow (date/party → time slot → guest details → optional payment).

**Source:** `apps/hospitality/src/components/booking-widget/BookingWidget.tsx:BookingWidget`, `apps/hospitality/src/components/booking-widget/BookingWidget.tsx:BookingWidgetProps`

**Steps (without deposit):** `date-party → time-slot → guest-details` (see `BookingWidget.tsx:STEP_KEYS_NO_DEPOSIT`)

**Steps (with deposit):** `date-party → time-slot → guest-details → payment` (see `BookingWidget.tsx:STEP_KEYS_WITH_DEPOSIT`)

**Related:** [WaitlistJoinView](#waitlist--waitlistentry), [Party Size](#party-size).

**Synonyms to avoid:** _reservation form_, _booking form_ — use **Booking Widget** in design discussions.

---

### No-Show

**Definition:** A reservation where the guest did not appear and the venue marked it `NO_SHOW`; increments `Guest.noShowCount` and may raise `GuestRiskScore`.

**Source:** `packages/types/src/reservation.ts:ReservationStatus` (value `"NO_SHOW"`), `packages/types/src/guest.ts:Guest.noShowCount`

**Impact:** `packages/types/src/guest.ts:GuestRiskScore` — `"standard"` → `"risky"` after `VenueSettings.autoDepositAfterNoShows` (default 2) no-shows.

**Related:** [Deposit](#deposit), [Guest](#guest).

**Synonyms to avoid:** _missed reservation_, _absent_ — use **no-show** (noun/adjective) or `NO_SHOW` (enum value).

---

### Party Size

**Definition:** The number of guests in a reservation or walk-in; used to filter available tables (`Table.minCovers` ≤ partySize ≤ `Table.maxCovers`).

**Source:** `packages/types/src/reservation.ts:Reservation.partySize` (runtime field), `packages/types/src/reservation.ts:WalkInRequest.partySize`

**Synonyms to avoid:** _cover count_, _group size_, _number of diners_ — use **party size** in copy and `partySize` in code.

---

### Venue

**Definition:** A single restaurant or hospitality location; the primary multi-tenancy boundary — all reservations, tables, guests, and floor plans belong to a Venue.

**Source:** `packages/types/src/venue.ts:Venue`

**Key fields:** `slug`, `ianaTimezone`, `currencyCode`, `operatingHours`, `settings`.

**Related:** [VenueGroup](#venuegroup).

---

### VenueGroup

**Definition:** An optional grouping of Venues under a single brand or operator; allows multi-venue operators to share settings.

**Source:** `packages/types/src/venue.ts:VenueGroup`

**Relationship:** `Venue.venueGroupId` → `VenueGroup.id` (nullable — a Venue may stand alone).

**Synonyms to avoid:** _restaurant group_, _brand_ — use **VenueGroup** in code.

---

## 2. Agent Platform

Context covers `packages/agent-core`, `services/agent`, `apps/gen`, `tools/` (mbe CLI).

### Session

**Definition:** A single bounded execution of an AI agent against a task description; runs in an isolated worktree and produces a `SessionResult`.

**Source:** `packages/agent-core/src/types.ts:SessionConfig`, `packages/agent-core/src/types.ts:SessionResult`, `packages/types/src/agent.ts:AgentSession`

**Lifecycle:** `pending → running → succeeded | failed | cancelled` (`packages/agent-core/src/types.ts:SessionStatus`)

**Entry point:** `packages/agent-core/src/session-runner.ts:runSession`

**Key fields (config):** `taskDescription`, `baseBranch`, `model`, `maxTurns`, `maxBudgetUsd`, `createPr`.

**Synonyms to avoid:** _run_, _job_, _execution_ — use **Session** in docs and code.

---

### Orchestrator

**Definition:** A meta-agent that decomposes a large task into independent sub-tasks and dispatches parallel child Sessions; never edits code directly.

**Source:** `packages/agent-core/src/orchestrator.ts:runOrchestrator`, `packages/agent-core/src/task-decomposer.ts:OrchestratorConfig`

**Output:** `packages/agent-core/src/task-decomposer.ts:OrchestratorResult` — reports `"succeeded" | "partially_succeeded" | "failed"`.

**Synonyms to avoid:** _coordinator_, _manager agent_ — use **Orchestrator**.

---

### Phase

**Definition:** One discrete, named stage in the session pipeline; each Phase is a stateless singleton that accepts an input and mutates the `SessionState` accumulator.

**Source:** `packages/agent-core/src/session-runner.ts` — five phases instantiated:
`WorktreePhase`, `QueryPhase`, `VerificationPhase`, `PublishPhase`, `FeedbackPhase`
(imported from `packages/agent-core/src/phases/index.ts`)

**Order:** Worktree → Query → Verification → Publish → Feedback

**Synonyms to avoid:** _step_, _stage_ — use **Phase** when discussing the session pipeline.

---

### Worktree

**Definition:** An isolated Git working tree under `.claude/worktrees/<session-id>/` branching from `main`; the blast-radius boundary for a single agent Session.

**Source:** `packages/agent-core/src/worktree-manager.ts`, `packages/agent-core/src/types.ts:WorktreeInfo`

**ADR:** [ADR-005](../adr/ADR-005-agent-worktree-isolation.md) — Agent Worktree Isolation.

**Directory constant:** `packages/agent-core/src/worktree-manager.ts:WORKTREE_DIR` (`".agent-worktrees"`)

**Synonyms to avoid:** _sandbox_, _clone_, _branch checkout_ — use **worktree** or `WorktreeInfo`.

---

### Reviewer

**Definition:** A lightweight LLM sub-agent that evaluates a worker&apos;s diff against acceptance criteria before a PR is created; fails open on timeout.

**Source:** `.claude/agents/reviewer.md` (the dispatchable agent), `packages/agent-core/src/reviewer-contract.ts:ReviewInput`, `packages/agent-core/src/reviewer-contract.ts:ReviewVerdict`

**Default model:** haiku (fast + cheap; sonnet for security-sensitive changes — see `.claude/skills/implement-queue/SKILL.md` Phase 2 step 3)

**Named diff-matched reviewers:** `migration-reviewer`, `adr-compliance-reviewer`, `dependency-update-reviewer`, `stripe-flow-reviewer`, `generated-artifact-determinism-reviewer` (source: `packages/agent-core/src/pr-risk-classifier.ts`)

**Synonyms to avoid:** _judge_, _evaluator_ (evaluator is a separate `success-evaluator.ts` concept) — use **Reviewer** for the pre-PR gate role.

---

### Merge Train

**Definition:** The serial sequence of steps that merges green PRs one at a time in implement-queue Phase 3: verify CI, set auto-merge, wait for GitHub to merge, then repeat for the next PR.

**Source:** `.claude/skills/implement-queue/SKILL.md` — "Phase 3: Serial merge train (oldest green PR first)"; `CLAUDE.md` label table — `has-pr` state.

**Mechanism:** `gh pr merge <N> --auto --squash --delete-branch` — GitHub merges once `CI Gate` is green and branch is up to date. Not a GitHub native merge queue (personal account limitation); see `docs/.claude/rules/gotchas.md` CI section.

**Synonyms to avoid:** _merge queue_, _auto-merge loop_ — use **merge train** in skill docs and runbooks.

---

### Label States (Issue Coordination State Machine)

**Definition:** GitHub issue labels that represent the lifecycle state of an issue in the implement-queue coordination protocol.

**Source:** `CLAUDE.md` (GitHub Labels table), `.claude/skills/implement-queue/SKILL.md:Phase 1`

| Label          | Meaning                                               |
| -------------- | ----------------------------------------------------- |
| `ready`        | Available for agent pickup                            |
| `in-progress`  | Agent is implementing it                              |
| `has-pr`       | PR created, awaiting merge                            |
| `agent-failed` | Agent could not complete — needs manual review        |
| `agent-skip`   | Exhausted retries — needs human or different approach |

**Transition:** `ready → in-progress` (Phase 1 claim), `in-progress → has-pr` (Phase 2 PR creation).

**Synonyms to avoid:** do not invent new coordination labels outside this set without updating both `CLAUDE.md` and this glossary.

---

## 3. Rialto Design System

Context covers `packages/rialto`, `packages/rialto-catalog`, `packages/rialto-plugin`, `apps/rialto-web`.

### Component

**Definition:** A curated, design-token-driven React UI primitive published by `packages/rialto` under `@mattbutlerengineering/rialto`; each Component has exactly one `*.catalog.ts` file declaring its catalog metadata.

**Source:** `packages/rialto/src/components/catalog-meta.ts:CatalogMeta.name`

**ADR:** [ADR-001](../adr/ADR-001-rialto-over-tailwind.md) — Rialto over Tailwind.

**Synonyms to avoid:** _widget_, _element_ (reserved for HTML) — use **Component** for a Rialto primitive.

---

### Registry

**Definition:** The hand-written map of prop→JSX adapters in `packages/rialto-catalog/src/registry.tsx` that translates catalog prop specs into actual React element invocations; also the generated `packages/rialto/registry.json` manifest consumed by external tools.

**Source:** `packages/rialto-catalog/src/registry.tsx` (adapter registry), `packages/rialto/registry.json` (generated manifest)

**Rule:** Every curated Component except `Toast` must have exactly one adapter entry (1:1 parity enforced by `drift-check.test.ts`).

**Related:** [Canonical Metadata](#canonical-metadata-catalogmeta), [Drift Check](#drift-check).

---

### Manifest

**Definition:** The generated JSON file (`packages/rialto/dist/manifest.json`) that lists all exported Components with their prop types; produced by `pnpm manifest` and consumed by the exports map generator.

**Source:** `packages/rialto/CLAUDE.md` — "Running `pnpm manifest` generates `dist/manifest.json`"

**Synonyms to avoid:** _catalog_ (the catalog is a different artifact — see [Registry](#registry)), _exports map_.

---

### Canonical Metadata (CatalogMeta)

**Definition:** The per-component co-located metadata struct declared in `<Component>.catalog.ts` that is the single source of truth for the catalog generator; specifies `include`, `description`, `slots`, `charLimits`, and `aliases`.

**Source:** `packages/rialto/src/components/catalog-meta.ts:CatalogMeta` (authoring type); `packages/rialto-catalog/src/catalog-meta.ts:CatalogMeta` (consumer mirror)

**ADR:** [ADR-013](../adr/ADR-013-rialto-catalog-source.md) — Co-located CatalogSource.

**Synonyms to avoid:** _catalog config_, _component config_ — use **CatalogMeta** (TypeScript) or **Canonical Metadata** (prose).

---

### Drift Check

**Definition:** The test (`packages/rialto-catalog/src/__tests__/drift-check.test.ts`) that asserts byte-for-byte reproducibility of `generated-schemas.ts` and `generated-catalog.ts` from the co-located `*.catalog.ts` sources, and enforces adapter↔meta 1:1 parity.

**Source:** `packages/rialto-catalog/src/__tests__/drift-check.test.ts`

**CI gate:** runs as part of `pnpm test` in `packages/rialto-catalog`; a stale generated file fails the test.

**Related:** [Canonical Metadata](#canonical-metadata-catalogmeta), [Registry](#registry).

**Synonyms to avoid:** _stale artifact check_, _parity check_ — use **drift check** (lowercase, noun).

---

## 4. Cross-Cutting Roles

These roles apply across all bounded contexts.

### Maintainer

**Definition:** The human owner of the repository who reviews HITL (human-in-the-loop) issues, approves infrastructure changes, and sets strategic direction; distinguished from automated agents by having direct `main` branch write access.

**Source:** `CLAUDE.md` — "fork maintainers will use their own DigitalOcean app ID"; `docs/governance.md`.

**Synonyms to avoid:** _admin_, _owner_ — use **maintainer** in workflow docs.

---

### Agent (AFK)

**Definition:** An autonomous coding agent that picks up `ready`-labeled issues, implements them in a [worktree](#worktree), and creates PRs without human intervention; operates asynchronously ("away from keyboard").

**Source:** `CLAUDE.md` Scheduled / Implement Queue mode descriptions; `packages/agent-core/src/session-runner.ts:runSession`

**Coordination entry:** `mbe agent run "<task>"` or dispatched by `/implement-queue` via the Agent tool with `subagent_type: "implement-queue-worker"`.

**Synonyms to avoid:** _bot_, _automation_, _script_ — use **agent** (lowercase) for the autonomous coding entity.

---

### Reporter

**Definition:** A scheduled tool or skill that discovers issues (bugs, audit findings, regressions, security gaps) and files them as GitHub issues for the implement-queue to pick up.

**Source:** `CLAUDE.md` RemoteTriggers table — `mbe-acmm-audit`, `mbe-learning-loop`, `/sentry-triage`, `/site-audit`

**Output:** GitHub issues labeled `ready` (or `needs-review` for HITL items).

**Synonyms to avoid:** _auditor_ (auditor is a specific kind of reporter — `acmm-audit`), _scanner_ — use **reporter** for the role.

---

## Divergences and Reconciliation Notes

| Term        | Existing usage                                                                            | Status                                                               |
| ----------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| _booking_   | Used interchangeably with _reservation_ in hospitality UI copy                            | Acceptable as UI copy only; use **Reservation** in API/DB layer      |
| _evaluator_ | `packages/agent-core/src/success-evaluator.ts` — an LLM judge for session output          | Distinct from **Reviewer** (pre-PR gate); do not conflate            |
| _session_   | Appears in both agent context (`SessionConfig`) and Auth0 context (user login session)    | Qualified by context: **agent session** vs. **auth session**         |
| _manifest_  | Rialto `dist/manifest.json` (component list) vs. `pnpm-workspace.yaml` workspace manifest | Qualified by context: **Rialto manifest** vs. **workspace manifest** |

---

_Last updated: 2026-06-30. Add new terms by editing this file and citing `path:symbol`._
