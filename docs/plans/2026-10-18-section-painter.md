# Section Painter — feasibility check + build plan

> **Status: future plan — unblocked, not yet filed.** Needs no venue history, no LLM key, and no external accounts. Nothing here is filed as an issue; run `/decompose` on this file to start it. File references verified against `main` at `482ed0bc6`, 2026-10-18.

## Context

"Why did Leo get three tables in a row?" Fair seating rotation means fair tips, and servers notice. Front-of-house staff decide whether a tool sticks; this is the one 2026-10-18 idea built for servers.

Section Painter: before service the manager **paints server sections** onto the floor plan — lasso tables, each server gets a colour. During service every table carries its server's colour; a live strip shows **covers per server** ("Maya 14 · Leo 9 · Sam 11"); on a walk-in the floor highlights **whose turn it is**. Uneven sections get a balance warning before service. Used every shift. Plugs into Host Stand (#7055, "seat in Maya's section"), Dress Rehearsal (#7049, simulate the rotation), and The Room in 3D (#7057, tinted sections). Matt loved it (2026-10-18).

## Verdict: feasible — new domain model, existing canvas and realtime

| Piece                                                      | Exists?                  | Where                                                                                                                          |
| ---------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Floor canvas with selection, keyboard nudge, a11y announce | yes                      | `apps/hospitality/src/components/floor-plan/FloorPlanCanvas.tsx` (`onTableSelect`, `onAnnounce`), `TableSelectionOverlay.tsx`  |
| Realtime table/reservation events for live cover counts    | yes                      | `services/reservations/src/services/events.ts` → SSE → `hooks/useSSESync.tsx`                                                  |
| Timeline + floor views to tint                             | yes                      | `components/timeline/TimelineGrid.tsx`, `FloorPlanCanvas` (`TABLE_STATUS_COLOR_TOKEN` pattern in `floor-plan/table-status.ts`) |
| Staff roster                                               | **partial — not usable** | `VenueMembership` requires `userSub` (a login); most servers will never have accounts                                          |
| Template "Zone"                                            | **not reusable**         | `venue-onboarding/floor-plan-templates.ts` `Zone` is a table-grid generator for templates, not a section                       |
| Sections, shift assignments, rotation                      | **no** — new             | nothing in repo                                                                                                                |

## Approach

### 1. Data model (one additive migration, `migration-reviewer`)

- `Server { id, venueId, displayName, initials, colorIndex, active }` — a name-only roster, no login. Optional `membershipId` link for staff who do have accounts.
- `Section { id, floorPlanId, name, colorIndex, tableIds String[] }` — a table belongs to at most one section per floor plan (enforced in the service + unit test).
- `ShiftAssignment { id, venueId, serviceDate, sectionId, serverId }`.
- Zod schemas in `@mbe/types`; venue-scoped routes under `requireVenueAccess` (ADR-020).

### 2. Paint tool (edit mode only)

Lasso on the Konva stage → hit-test table rects → assign to the active section. Keyboard alternative: pick a section, then arrow/Enter through tables to toggle (reuses canvas keyboard focus). Section legend with rename/colour/delete. Colours from a rialto token palette; **every section also shows the server's initials badge** (colour-blind safe).

### 3. Pure logic

- `coversBySection(reservations, sections, assignments, now)` → active covers per server.
- `nextInRotation(sections, assignments, recentSeatings, rule = "fewest-active-covers")` → section id.
- `sectionBalance(sections, tables)` → seats per section + spread warning.
  All unit-tested; no React.

### 4. Service-time UI

Covers-per-server strip (top of timeline and floor views), section tint on tables, "next up" highlight on the floor when a walk-in or arrival is pending. Advisory only — the host always decides.

### 5. Shift setup

"Tonight's sections" pre-service panel: copy last shift's assignments, swap servers, see the balance check, save.

## Risks

- **Rotation styles vary** (strict turn order, by covers, by tables) → v1 ships one advisory rule; the rule is a parameter so others can be added.
- **Accounts for servers** → name-only roster avoids forcing logins; link to a membership is optional.
- **Colour-only coding** → initials badges + patterned tint for accessibility.
- **Moving tables between floor plans** → sections are per floor plan; activating a different plan uses its own sections.

## Delivery

`/decompose` into ordered issues: (1) `Server`/`Section`/`ShiftAssignment` schema + CRUD routes, (2) pure `coversBySection` / `nextInRotation` / `sectionBalance`, (3) paint tool + keyboard path, (4) section tint + initials on canvas and timeline, (5) covers strip + next-up highlight, (6) shift setup panel, (7) E2E. TDD each.

## Verification

- Unit: one-section-per-table invariant; covers counting across seat/depart events; rotation picks fewest active covers with deterministic tie-break; balance spread threshold.
- Route: 403 for another venue; section referencing a table from a different floor plan → 400.
- E2E (hospitality Playwright): paint two sections → assign servers → seat a reservation → strip updates without reload → next-up highlight moves.
- Manual: keyboard-only section painting; colour-blind simulation check of tints + badges.
