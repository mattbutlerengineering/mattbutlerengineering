# Hospitality Core Operations — Design Spec

## Overview

Enable day-to-day restaurant operations in the hospitality app by adding table management, timeline actions, table status tracking, and walk-in support.

## Features

### 1. Table Management (Floor Plan Editor)

Add table creation and deletion to the existing floor plan editor.

**Create flow:** Toolbar "Add Table" button opens a Dialog with fields: table name, capacity (min/max covers), shape (square/round/rectangle). New table appears at canvas center for positioning.

**Delete flow:** Delete button in the selected-table sidebar with ConfirmDialog.

**Edit flow:** Inline editing of capacity/name in the existing selected-table sidebar.

All changes persist via existing table CRUD endpoints and bulk position API.

### 2. Timeline Action Buttons

Wire up the existing Edit/Seat/Cancel buttons on the timeline reservation sidebar.

- **Seat:** Sets reservation status to CONFIRMED (guest has arrived), sets table status to OCCUPIED. Only available for PENDING reservations.
- **Cancel:** Opens CancelReservationDialog with reason dropdown (guest_cancelled, no_show, restaurant_cancelled, other) and optional note. Uses PATCH with `{ status: "CANCELLED", cancellationReason, cancellationNote }`.
- **Edit:** Opens EditReservationDrawer with editable fields (time, party size, table, notes). Saves via PATCH with conflict checking.

All actions emit SSE events for real-time sync.

### 3. Table Status Tracking

New `status` field on the Table model: AVAILABLE, OCCUPIED, DIRTY, READY.

**Transitions (all manual via staff action in timeline):**

- AVAILABLE → OCCUPIED (staff clicks "Seat" on a reservation)
- OCCUPIED → DIRTY (staff marks table after guests leave)
- DIRTY → READY (staff marks table as reset — optional two-step cleaning)
- READY → AVAILABLE (staff marks table as ready for next guest)
- DIRTY → AVAILABLE (shortcut: skip READY step for quick turnover)

**API:** `PATCH /api/v1/tables/:id/status` for explicit transitions.

**UI:** Color-coded status badges on timeline table column and floor plan canvas shapes. New SSE event `table:status-changed`.

### 4. Walk-in Support

Quick-seat flow for guests without reservations.

**UI:** "Walk-in" button on Timeline page header opens WalkInDialog with: party size, auto-suggested best available table (editable), optional guest name, duration estimate.

**Behavior:** Creates reservation with status CONFIRMED immediately (guest is present and seated). Sets table to OCCUPIED. No hold system — instant seating.

**Table auto-suggest:** Smallest-capacity available table that fits the party size, sorted by capacity ascending.

**API:** `POST /api/v1/reservations/walk-in` accepts party size, table ID, venue ID, optional guest name/duration.

**Guard:** Table deletion is blocked if the table has future reservations (existing 409 response on DELETE).

## Data Model Changes

```prisma
enum TableStatus {
  AVAILABLE
  OCCUPIED
  DIRTY
  READY
}

model Table {
  // existing fields...
  status    TableStatus @default(AVAILABLE)
}

model Reservation {
  // existing fields...
  cancellationReason  String?
  cancellationNote    String?
}
```

## New Components

| Component               | Purpose                             |
| ----------------------- | ----------------------------------- |
| AddTableDialog          | Create table from floor plan editor |
| CancelReservationDialog | Cancel with reason/note             |
| EditReservationDrawer   | Edit reservation details            |
| WalkInDialog            | Quick-seat walk-in guests           |
| TableStatusBadge        | Color-coded table status indicator  |

## API Changes

| Endpoint                            | Change                                                       |
| ----------------------------------- | ------------------------------------------------------------ |
| `PATCH /api/v1/tables/:id/status`   | New — status transitions                                     |
| `PATCH /api/v1/reservations/:id`    | Accept cancellationReason/Note                               |
| `PATCH /api/v1/reservations/:id`    | Also used for cancellation with reason (no DELETE with body) |
| `POST /api/v1/reservations/walk-in` | New — instant seated reservation                             |
| SSE `table:status-changed`          | New event type                                               |

## Success Criteria

1. Restaurant manager can create tables in the floor plan editor
2. Staff can seat, edit, and cancel reservations from the timeline
3. Tables show real-time operational status
4. Walk-in guests can be seated in under 5 seconds
5. All actions sync across connected clients via SSE
