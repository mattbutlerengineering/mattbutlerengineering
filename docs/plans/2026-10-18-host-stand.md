# Host Stand — feasibility check + build plan

> **Status: future plan — unblocked, not yet filed.** Needs no venue history and no LLM key. Nothing here is filed as an issue; run `/decompose` on this file to start it. File references verified against `main` at `56fedb2c2`, 2026-10-18.

## Context

The hospitality product has no users yet. Hosts — not owners — decide whether a tool survives a Friday rush, so the in-service experience has to feel effortless.

Host Stand: one full-screen, iPad-first service view. Live floor plan centre stage, waitlist and upcoming arrivals docked beside it. **Drag a waiting party onto a table** to seat them; the guest gets "your table is ready". The wow is **Figma-style presence**: every staff device shows the others live ("Maya is seating T12", a coloured ring on the table she's touching), and the room updates in real time on every screen. Two iPads side by side — drag on one, the other moves. Paired with Dress Rehearsal (#7049) it's a full demo with zero real guests. Matt loved it (2026-10-18).

## Verdict: feasible — mostly assembly on existing real-time plumbing

| Piece                                              | Exists?      | Where                                                                                                                             |
| -------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Server-sent events stream                          | yes          | `GET .../stream` (`services/reservations/src/routes/events.ts:71`), `services/sse-connection.ts`                                  |
| Domain events fanned out                           | yes          | `reservation:created/updated/cancelled`, `table:updated`, `table-status:changed` (`services/reservations/src/services/events.ts`) |
| Client SSE + query invalidation                    | yes          | `apps/hospitality/src/lib/sse-client.ts`, `hooks/useSSESync.tsx`, `hooks/sse-query-keys.ts`                                       |
| Canvas aware of stale connections                  | yes          | `FloorPlanCanvas` `isStale` prop; `components/OfflineBanner.tsx`                                                                  |
| Waitlist UI + data                                 | yes          | `pages/WaitlistPage.tsx`, `hooks/useWaitlist.ts`                                                                                  |
| "Table is ready" notification (Twilio)             | yes          | `services/reservations/src/routes/waitlist.ts:189-209` → `services/waitlist-notifier.ts` `notifyTableReady`                       |
| Walk-in flow                                       | yes          | `components/timeline/WalkInDialog.tsx`                                                                                            |
| Presence (who is looking at / touching what)       | **no** — new | nothing in repo                                                                                                                   |
| Drag-to-seat from waitlist/arrivals onto the floor | **no** — new |                                                                                                                                   |
| Combined touch-first service view                  | **no** — new |                                                                                                                                   |

### Constraint that shapes presence

Event fan-out is an **in-process `EventEmitter`** (`ReservationEventEmitter`, `services/events.ts:21`) and services run at `instanceCount: 1` (`infrastructure/pulumi/index.ts:126`). In-memory presence is therefore correct today. It breaks the moment reservations-api scales past one instance — and so would the existing SSE fan-out. Design presence behind a small interface so a Redis pub/sub backend can replace it (prod has no Redis today — see `docs/backlog.md`); don't build that now.

## Approach

### 1. Presence (server)

- `POST /api/v1/venues/:id/presence` heartbeat `{ focus?: { kind: "table" | "waitlist-entry" | "reservation", id }, action?: "viewing" | "seating" }` every ~10s and on focus change; `requireAuth` + `requireVenueAccess` (ADR-020); per-user rate limit.
- `PresenceStore` interface, in-memory implementation: TTL ~25s, keyed by venue + user. Never persisted.
- Emits `presence:changed` over the existing SSE stream (venue-scoped, debounced). Payload: user display name, colour index, focus, action — no email.

### 2. Presence (client)

`usePresence(venueId)` hook: heartbeat on focus change, pause when tab hidden, prune on TTL. Rings on `FloorPlanCanvas` tables (new optional `presence` prop: `ReadonlyMap<tableId, PresenceMarker[]>`), avatars on waitlist rows, "Maya is seating T12" toast. Colours from rialto tokens. No `setState` in effect bodies in rialto code (gotcha).

### 3. `HostStandPage`

Route `/hospitality/host`: canvas centre; docked waitlist + next-90-min arrivals; landscape iPad layout, ≥44px targets, large type; live clock. Reuses `useWaitlist`, reservation queries, `useSSESync`.

### 4. Drag-to-seat

Drag a waitlist entry or arriving reservation onto a fitting table → existing seat/status transitions (no new server write path). Optimistic update with rollback on conflict ("T12 was just taken"). Non-fitting tables dim during drag. Keyboard/screen-reader alternative: "Seat at…" menu on each row (a11y parity, not drag-only).

### 5. Seat + notify

After seating a waitlist party, a one-tap "Text them" (confirm) → existing `notifyTableReady`. Never automatic — SMS costs money.

### 6. Kiosk polish (optional)

Fullscreen, Screen Wake Lock, aggressive SSE reconnect, offline banner.

## Risks

- **Double-seat race**: server transitions are the source of truth; presence only warns. Integration test: two concurrent seats on one table → one wins.
- **Venue Wi-Fi**: SSE reconnect + optimistic rollback; test on a real iPad on a throttled network.
- **Scale-out**: in-memory presence and SSE fan-out both assume one instance — documented above, interface ready for Redis.
- **SMS cost/abuse**: explicit tap + confirmation; existing notifier rate limits.

## Delivery

`/decompose` into ordered issues: (1) `PresenceStore` + heartbeat route + `presence:changed`, (2) `usePresence` + canvas rings, (3) `HostStandPage` layout, (4) drag-to-seat + a11y menu, (5) seat-and-notify, (6) conflict toasts, (7) E2E with two browser contexts, (8) kiosk polish. Steps 1–5 are the shippable feature. TDD each.

## Verification

- Unit: `PresenceStore` TTL/pruning/venue isolation; drag-target fit rules.
- Route: presence 401/403 (other venue)/429; `presence:changed` only reaches same-venue streams.
- E2E (hospitality Playwright, two contexts): context A focuses T12 → B shows ring; A drags waitlist party onto T12 → B's floor shows occupied without reload; concurrent seat → loser sees conflict toast.
- Manual: two real iPads on a preview deploy, one on throttled Wi-Fi; run on top of a Dress Rehearsal session once it exists.
