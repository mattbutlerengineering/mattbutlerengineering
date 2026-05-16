# Hospitality Core Operations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable day-to-day restaurant operations: table management, timeline actions, table status tracking, and walk-in support.

**Architecture:** Backend changes in `services/reservations/` (Prisma schema + Fastify routes + services). Frontend changes in `apps/hospitality/` (React pages + components). Shared types in `packages/types/`. API client in `packages/api-client/`.

**Tech Stack:** TypeScript, Fastify, Prisma, React 19, Vitest, Rialto design system, Konva (canvas)

**Spec:** `docs/superpowers/specs/2026-03-16-hospitality-core-operations-design.md`

---

## Chunk 1: Data Model & Backend — Table Status + Cancellation Fields

### Task 1: Prisma Schema Migration

**Files:**

- Modify: `services/reservations/prisma/schema.prisma`

- [ ] **Step 1: Add TableStatus enum and fields to schema**

Add after line 17 (after `ReservationStatus` enum):

```prisma
enum TableStatus {
  AVAILABLE
  OCCUPIED
  DIRTY
  READY
}
```

Add `status` field to the `Table` model (after line 76, the `isActive` field):

```prisma
  status        TableStatus       @default(AVAILABLE)
```

Add cancellation fields to `Reservation` model (after line 122, the `notes` field):

```prisma
  cancellationReason String?  @map("cancellation_reason")
  cancellationNote   String?  @map("cancellation_note")
```

- [ ] **Step 2: Generate and apply migration**

Run from `services/reservations/`:

```bash
npx prisma migrate dev --name add_table_status_and_cancellation_fields
```

Expected: Migration created in `prisma/migrations/<timestamp>_add_table_status_and_cancellation_fields/migration.sql`

- [ ] **Step 3: Verify Prisma client generation**

Run: `npx prisma generate`
Expected: Client generated at `src/generated/prisma`

- [ ] **Step 4: Commit**

```bash
git add services/reservations/prisma/
git commit -m "feat: add TableStatus enum and cancellation fields to schema"
```

### Task 2: Update Shared Types

**Files:**

- Modify: `packages/types/src/reservation.ts`

- [ ] **Step 1: Add TableStatus type and update Table interface**

Add after the `ReservationStatus` type (line 6):

```typescript
export type TableStatus = "AVAILABLE" | "OCCUPIED" | "DIRTY" | "READY";
```

Add `status` field to the `Table` interface (after line 19, the `priority` field):

```typescript
status: TableStatus;
```

Add cancellation fields to the `Reservation` interface (after line 34, the `notes` field):

```typescript
cancellationReason: string | null;
cancellationNote: string | null;
```

Add `cancellationReason` and `cancellationNote` to `UpdateReservationRequest` (after line 68, the `notes` field):

```typescript
  cancellationReason?: string;
  cancellationNote?: string;
```

- [ ] **Step 2: Add UpdateTableStatusRequest type**

Add at the end of the file:

```typescript
export interface UpdateTableStatusRequest {
  status: TableStatus;
}
```

- [ ] **Step 3: Add WalkInRequest type**

Add at the end of the file:

```typescript
export interface WalkInRequest {
  partySize: number;
  tableId: string;
  venueId: string;
  guestName?: string;
  durationMinutes?: number;
}
```

- [ ] **Step 4: Verify types build**

Run from root: `pnpm build --filter=@mbe/types`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/types/
git commit -m "feat: add TableStatus, cancellation, and walk-in types"
```

### Task 3: Update Table Service for Status

**Files:**

- Modify: `services/reservations/src/services/table.ts`
- Test: `services/reservations/src/routes/tables.test.ts`

- [ ] **Step 1: Write failing test for table status update**

Add to `tables.test.ts`:

```typescript
describe("PATCH /api/v1/tables/:id/status", () => {
  it("should update table status", async () => {
    vi.mocked(tableService.updateStatus).mockResolvedValueOnce({
      id: "table-1",
      name: "Table 1",
      tableNumber: null,
      capacity: 4,
      minCovers: 1,
      maxCovers: null,
      location: null,
      isActive: true,
      status: "OCCUPIED",
      priority: 0,
      venueId: null,
      floorPlanId: null,
      shapeMetadata: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/tables/table-1/status",
      headers: { authorization: "Bearer valid-token" },
      payload: { status: "OCCUPIED" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).data.status).toBe("OCCUPIED");
  });

  it("should reject invalid status", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/tables/table-1/status",
      headers: { authorization: "Bearer valid-token" },
      payload: { status: "INVALID" },
    });

    expect(response.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/reservations && npx vitest run src/routes/tables.test.ts --reporter=verbose`
Expected: FAIL — `updateStatus` is not a function

- [ ] **Step 3: Add updateStatus to table service**

In `services/reservations/src/services/table.ts`, add after the `delete` method:

```typescript
  async updateStatus(id: string, status: string): Promise<Table | null> {
    const validStatuses = ["AVAILABLE", "OCCUPIED", "DIRTY", "READY"];
    if (!validStatuses.includes(status)) {
      return null;
    }
    try {
      const table = await prisma.table.update({
        where: { id },
        data: { status: status as TableStatus },
      });
      return mapPrismaTable(table);
    } catch {
      return null;
    }
  },
```

Import `TableStatus` from the Prisma generated client at the top of the file.

- [ ] **Step 4: Update the mapPrismaTable function to include status**

In the `mapPrismaTable` function, add `status` to the returned object (it should already map through if Prisma returns it, but verify it's included).

- [ ] **Step 5: Add the status route to tables.ts**

In `services/reservations/src/routes/tables.ts`, add before the delete route (before line 351):

```typescript
// Update table status
fastify.patch<{
  Params: { id: string };
  Body: { status: string };
  Reply: ApiResponse<Table> | ApiError;
}>(
  "/:id/status",
  {
    preHandler: verifyAuth,
    schema: {
      summary: "Update table status",
      operationId: "updateTableStatus",
      description: "Update the operational status of a table (AVAILABLE, OCCUPIED, DIRTY, READY).",
      tags: ["Tables"],
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        properties: {
          id: { type: "string", description: "Table ID" },
        },
        required: ["id"],
      },
      body: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["AVAILABLE", "OCCUPIED", "DIRTY", "READY"],
            description: "New table status",
          },
        },
        required: ["status"],
      },
      response: {
        200: {
          description: "Status updated",
          type: "object",
          properties: { data: { $ref: "Table#" } },
        },
        400: { description: "Invalid status", $ref: "Error#" },
        401: { description: "Auth required", $ref: "Error#" },
        404: { description: "Table not found", $ref: "Error#" },
      },
    },
  },
  async (request, reply) => {
    const table = await tableService.updateStatus(request.params.id, request.body.status);
    if (!table) {
      return reply.code(404).send({
        error: "Not Found",
        message: "Table not found or invalid status",
        statusCode: 404,
      });
    }
    emitTableUpdated(table);
    return { data: table };
  }
);
```

Import `emitTableUpdated` from `../services/events.js` at the top.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd services/reservations && npx vitest run src/routes/tables.test.ts --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add services/reservations/src/
git commit -m "feat: add table status update endpoint"
```

### Task 4: Update Reservation Cancel with Reason

**Files:**

- Modify: `services/reservations/src/services/reservation.ts`
- Modify: `services/reservations/src/routes/reservations.ts`
- Test: `services/reservations/src/routes/reservations.test.ts`

- [ ] **Step 1: Write failing test for cancel with reason**

Add to `reservations.test.ts`:

```typescript
describe("PATCH /api/v1/reservations/:id cancellation", () => {
  it("should cancel with reason and note via PATCH", async () => {
    vi.mocked(reservationService.cancel).mockResolvedValueOnce({
      id: "res-1",
      date: "2026-03-20",
      startTime: "2026-03-20T18:00:00.000Z",
      endTime: "2026-03-20T19:30:00.000Z",
      partySize: 4,
      status: "CANCELLED",
      notes: null,
      cancellationReason: "guest_cancelled",
      cancellationNote: "Called ahead",
      guestName: "John",
      guestEmail: null,
      guestPhone: null,
      guestId: null,
      userId: null,
      tableId: "table-1",
      venueId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/reservations/res-1",
      payload: {
        status: "CANCELLED",
        cancellationReason: "guest_cancelled",
        cancellationNote: "Called ahead",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data.cancellationReason).toBe("guest_cancelled");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/reservations && npx vitest run src/routes/reservations.test.ts --reporter=verbose`

- [ ] **Step 3: Update reservation service cancel method**

In `services/reservations/src/services/reservation.ts`, update the `cancel` method (line 336):

```typescript
  async cancel(
    id: string,
    reason?: string,
    note?: string
  ): Promise<Reservation | null> {
    try {
      const reservation = await prisma.reservation.update({
        where: { id },
        data: {
          status: "CANCELLED",
          ...(reason && { cancellationReason: reason }),
          ...(note && { cancellationNote: note }),
        },
        include: { table: true },
      });
      return mapPrismaReservation(reservation);
    } catch {
      return null;
    }
  },
```

- [ ] **Step 4: Update the mapPrismaReservation to include cancellation fields**

Ensure the mapping function includes `cancellationReason` and `cancellationNote`.

- [ ] **Step 5: Update PATCH route handler to detect cancellation**

In `services/reservations/src/routes/reservations.ts`, update the existing PATCH `/:id` handler. When the update includes `status: "CANCELLED"`, call `reservationService.cancel()` with the reason fields instead of `updateWithConflictCheck()`:

```typescript
    async (request, reply) => {
      if (request.body.status === "CANCELLED") {
        const reservation = await reservationService.cancel(
          request.params.id,
          request.body.cancellationReason,
          request.body.cancellationNote
        );
        if (!reservation) {
          return reply.code(404).send({
            error: "Not Found",
            message: "Reservation not found",
            statusCode: 404,
          });
        }
        emitReservationCancelled(reservation);
        return { data: reservation };
      }
      // ... existing update logic
```

Also add `cancellationReason` and `cancellationNote` to the PATCH body schema properties.

- [ ] **Step 6: Run tests**

Run: `cd services/reservations && npx vitest run src/routes/reservations.test.ts --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add services/reservations/src/
git commit -m "feat: add cancellation reason and note to reservation cancel"
```

### Task 5: Walk-in Endpoint

**Files:**

- Modify: `services/reservations/src/services/reservation.ts`
- Modify: `services/reservations/src/routes/reservations.ts`
- Test: `services/reservations/src/routes/reservations.test.ts`

- [ ] **Step 1: Write failing test for walk-in**

Add to `reservations.test.ts`:

```typescript
describe("POST /api/v1/reservations/walk-in", () => {
  it("should create a walk-in reservation with COMPLETED status", async () => {
    vi.mocked(reservationService.createWalkIn).mockResolvedValueOnce({
      id: "res-walkin-1",
      date: "2026-03-20",
      startTime: "2026-03-20T18:00:00.000Z",
      endTime: "2026-03-20T19:30:00.000Z",
      partySize: 2,
      status: "CONFIRMED",
      notes: null,
      cancellationReason: null,
      cancellationNote: null,
      guestName: "Walk-in",
      guestEmail: null,
      guestPhone: null,
      guestId: null,
      userId: null,
      tableId: "table-1",
      venueId: "venue-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/reservations/walk-in",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        partySize: 2,
        tableId: "table-1",
        venueId: "venue-1",
        guestName: "Walk-in",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.payload).data.status).toBe("COMPLETED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/reservations && npx vitest run src/routes/reservations.test.ts --reporter=verbose`

- [ ] **Step 3: Add createWalkIn to reservation service**

In `services/reservations/src/services/reservation.ts`, add:

```typescript
  async createWalkIn(data: {
    partySize: number;
    tableId: string;
    venueId: string;
    guestName?: string;
    durationMinutes?: number;
  }): Promise<Reservation> {
    const now = new Date();
    const duration = data.durationMinutes ?? 90;
    const endTime = new Date(now.getTime() + duration * 60 * 1000);
    const dateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const reservation = await prisma.reservation.create({
      data: {
        date: dateOnly,
        startTime: now,
        endTime,
        partySize: data.partySize,
        status: "CONFIRMED",
        tableId: data.tableId,
        venueId: data.venueId,
        guestName: data.guestName ?? "Walk-in",
      },
      include: { table: true },
    });

    return mapPrismaReservation(reservation);
  },
```

- [ ] **Step 4: Add the walk-in route**

In `services/reservations/src/routes/reservations.ts`, add before the GET `/:id` route:

```typescript
// Walk-in (requires auth)
fastify.post<{
  Body: {
    partySize: number;
    tableId: string;
    venueId: string;
    guestName?: string;
    durationMinutes?: number;
  };
  Reply: ApiResponse<Reservation> | ApiError;
}>(
  "/walk-in",
  {
    preHandler: verifyAuth,
    schema: {
      summary: "Create walk-in reservation",
      operationId: "createWalkIn",
      description: "Instantly seat a walk-in guest. Creates a reservation with COMPLETED status.",
      tags: ["Reservations"],
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        properties: {
          partySize: { type: "integer", minimum: 1, description: "Number of guests" },
          tableId: { type: "string", description: "Table to seat at" },
          venueId: { type: "string", description: "Venue ID" },
          guestName: { type: "string", description: "Guest name (optional)" },
          durationMinutes: {
            type: "integer",
            minimum: 15,
            description: "Expected duration in minutes",
          },
        },
        required: ["partySize", "tableId", "venueId"],
      },
      response: {
        201: {
          description: "Walk-in seated",
          type: "object",
          properties: { data: { $ref: "Reservation#" } },
        },
        401: { description: "Auth required", $ref: "Error#" },
      },
    },
  },
  async (request, reply) => {
    const reservation = await reservationService.createWalkIn(request.body);
    await tableService.updateStatus(request.body.tableId, "OCCUPIED");
    const table = await tableService.getById(request.body.tableId);
    if (table) emitTableUpdated(table);
    emitReservationCreated(reservation);
    return reply.code(201).send({ data: reservation });
  }
);
```

Import `tableService` from `../services/table.js` and `emitTableUpdated` from `../services/events.js`.

**Important:** The walk-in route MUST be registered before `/:id` routes, otherwise Fastify will match "walk-in" as an `:id` parameter.

- [ ] **Step 5: Run tests**

Run: `cd services/reservations && npx vitest run src/routes/reservations.test.ts --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 6: Run full backend test suite**

Run: `cd services/reservations && pnpm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add services/reservations/src/
git commit -m "feat: add walk-in reservation endpoint"
```

---

## Chunk 2: API Client & Type Updates

### Task 6: Update API Client

**Files:**

- Modify: `packages/api-client/src/tables.ts`
- Modify: `packages/api-client/src/reservations.ts`

- [ ] **Step 1: Add updateStatus to TablesClient**

In `packages/api-client/src/tables.ts`, add after the `delete` method:

```typescript
  /**
   * Update table operational status
   */
  async updateStatus(id: string, status: string): Promise<Table> {
    const response = await this.client.patch<ApiResponse<Table>>(
      `/api/v1/tables/${id}/status`,
      { status }
    );
    return response.data;
  }
```

- [ ] **Step 2: Add cancelWithReason to ReservationsClient**

In `packages/api-client/src/reservations.ts`, add a new method (keep existing `cancel` for backwards compat):

```typescript
  /**
   * Cancel a reservation with reason via PATCH
   */
  async cancelWithReason(
    id: string,
    reason?: { cancellationReason?: string; cancellationNote?: string }
  ): Promise<Reservation> {
    return this.update(id, {
      status: "CANCELLED",
      ...reason,
    });
  }
```

- [ ] **Step 3: Add walkIn to ReservationsClient**

Add after the `cancel` method:

```typescript
  /**
   * Create a walk-in reservation (instantly seated)
   */
  async walkIn(data: {
    partySize: number;
    tableId: string;
    venueId: string;
    guestName?: string;
    durationMinutes?: number;
  }): Promise<Reservation> {
    const response = await this.client.post<ApiResponse<Reservation>>(
      "/api/v1/reservations/walk-in",
      data
    );
    return response.data;
  }
```

- [ ] **Step 4: Verify API client builds**

Run: `pnpm build --filter=@mbe/api-client`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/
git commit -m "feat: add table status, cancel with reason, and walk-in to API client"
```

---

## Chunk 3: Frontend — Table Management in Floor Plan Editor

### Task 7: Add Table Dialog Component

**Files:**

- Create: `apps/hospitality/src/components/floor-plan/AddTableDialog.tsx`
- Create: `apps/hospitality/src/components/floor-plan/AddTableDialog.module.css`

- [ ] **Step 1: Create AddTableDialog component**

```typescript
import { useState } from "react";
import type { CreateTableRequest } from "@mbe/types";
import styles from "./AddTableDialog.module.css";

interface AddTableDialogProps {
  venueId: string;
  floorPlanId: string;
  onSubmit: (data: CreateTableRequest) => Promise<void>;
  onClose: () => void;
}

type TableShape = "rectangle" | "circle" | "square";

export function AddTableDialog({ venueId, floorPlanId, onSubmit, onClose }: AddTableDialogProps) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [minCovers, setMinCovers] = useState(1);
  const [shape, setShape] = useState<TableShape>("rectangle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Table name is required");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        capacity,
        minCovers,
        maxCovers: capacity,
        venueId,
        floorPlanId,
        shapeMetadata: {
          x: 400,
          y: 300,
          width: shape === "circle" ? 80 : 100,
          height: shape === "circle" ? 80 : shape === "square" ? 100 : 60,
          shape,
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create table");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Add Table</h3>
        <form onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Table 1, Patio A"
              autoFocus
            />
          </label>
          <label className={styles.field}>
            <span>Capacity</span>
            <input
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={20}
            />
          </label>
          <label className={styles.field}>
            <span>Min Covers</span>
            <input
              type="number"
              value={minCovers}
              onChange={(e) => setMinCovers(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={capacity}
            />
          </label>
          <fieldset className={styles.field}>
            <legend>Shape</legend>
            <div className={styles.shapeOptions}>
              {(["rectangle", "square", "circle"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${styles.shapeBtn} ${shape === s ? styles.shapeBtnActive : ""}`}
                  onClick={() => setShape(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </fieldset>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Add Table"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CSS module**

Create `AddTableDialog.module.css` with dialog overlay, form fields, shape selector, and action buttons. Use Rialto tokens (`--rialto-surface`, `--rialto-radius-default`, `--rialto-shadow-lg`, etc.) for consistent styling.

- [ ] **Step 3: Commit**

```bash
git add apps/hospitality/src/components/floor-plan/AddTableDialog.*
git commit -m "feat: add AddTableDialog component"
```

### Task 8: Wire Add/Delete Table into Floor Plan Editor

**Files:**

- Modify: `apps/hospitality/src/pages/FloorPlanEditorPage.tsx`

- [ ] **Step 1: Add "Add Table" button and dialog state**

Add state variables:

```typescript
const [showAddDialog, setShowAddDialog] = useState(false);
```

Add handler for creating a table:

```typescript
const handleAddTable = async (data: CreateTableRequest) => {
  const newTable = await api.tables.create(data);
  setTables((prev) => [...prev, newTable]);
};
```

Add handler for deleting a table:

```typescript
const handleDeleteTable = async (tableId: string) => {
  await api.tables.delete(tableId);
  setTables((prev) => prev.filter((t) => t.id !== tableId));
  setSelectedTableId(null);
};
```

- [ ] **Step 2: Add "Add Table" button to the header area**

In the header section (around line 147), add an "Add Table" button next to the "Save" button:

```tsx
<button className={styles.addTableBtn} onClick={() => setShowAddDialog(true)}>
  + Add Table
</button>
```

- [ ] **Step 3: Add delete button in the selected table sidebar**

In the sidebar where selected table details are shown (around line 200), add a delete button:

```tsx
<button
  className={styles.deleteBtn}
  onClick={() => {
    if (confirm("Delete this table? This cannot be undone.")) {
      handleDeleteTable(selectedTable.id);
    }
  }}
>
  Delete Table
</button>
```

- [ ] **Step 4: Render AddTableDialog conditionally**

At the end of the component return, add:

```tsx
{
  showAddDialog && floorPlan && (
    <AddTableDialog
      venueId={floorPlan.venueId}
      floorPlanId={floorPlan.id}
      onSubmit={handleAddTable}
      onClose={() => setShowAddDialog(false)}
    />
  );
}
```

- [ ] **Step 5: Verify the page builds**

Run: `pnpm build --filter=@mbe/hospitality`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add apps/hospitality/src/pages/FloorPlanEditorPage.tsx
git commit -m "feat: wire add/delete table into floor plan editor"
```

---

## Chunk 4: Frontend — Timeline Action Buttons

### Task 9: Cancel Reservation Dialog

**Files:**

- Create: `apps/hospitality/src/components/timeline/CancelReservationDialog.tsx`
- Create: `apps/hospitality/src/components/timeline/CancelReservationDialog.module.css`

- [ ] **Step 1: Create CancelReservationDialog**

```typescript
import { useState } from "react";
import styles from "./CancelReservationDialog.module.css";

const REASONS = [
  { value: "guest_cancelled", label: "Guest cancelled" },
  { value: "no_show", label: "No show" },
  { value: "restaurant_cancelled", label: "Restaurant cancelled" },
  { value: "other", label: "Other" },
] as const;

interface CancelReservationDialogProps {
  reservationId: string;
  guestName: string | null;
  onConfirm: (reason: string, note: string) => Promise<void>;
  onClose: () => void;
}

export function CancelReservationDialog({
  guestName,
  onConfirm,
  onClose,
}: CancelReservationDialogProps) {
  const [reason, setReason] = useState(REASONS[0].value);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfirm(reason, note);
      onClose();
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Cancel Reservation</h3>
        <p className={styles.subtitle}>
          Cancel reservation for {guestName ?? "Guest"}?
        </p>
        <form onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Additional details..."
            />
          </label>
          <div className={styles.actions}>
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Keep Reservation
            </button>
            <button type="submit" className={styles.cancelBtn} disabled={isSubmitting}>
              {isSubmitting ? "Cancelling..." : "Cancel Reservation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CSS module**

Style the dialog consistently with `AddTableDialog.module.css`. The cancel button should use a red/destructive color scheme.

- [ ] **Step 3: Commit**

```bash
git add apps/hospitality/src/components/timeline/CancelReservationDialog.*
git commit -m "feat: add CancelReservationDialog component"
```

### Task 10: Edit Reservation Drawer

**Files:**

- Create: `apps/hospitality/src/components/timeline/EditReservationDrawer.tsx`
- Create: `apps/hospitality/src/components/timeline/EditReservationDrawer.module.css`

- [ ] **Step 1: Create EditReservationDrawer**

A slide-out panel with editable fields: time, party size, table assignment, notes. Uses `onSave` callback that calls `api.reservations.update()`.

Key fields:

- Start time (input type="time")
- End time (input type="time")
- Party size (number input)
- Table (select dropdown from available tables)
- Notes (textarea)

```typescript
import { useState } from "react";
import type { Reservation, Table, UpdateReservationRequest } from "@mbe/types";
import styles from "./EditReservationDrawer.module.css";

interface EditReservationDrawerProps {
  reservation: Reservation;
  tables: Table[];
  onSave: (id: string, data: UpdateReservationRequest) => Promise<void>;
  onClose: () => void;
}

export function EditReservationDrawer({
  reservation,
  tables,
  onSave,
  onClose,
}: EditReservationDrawerProps) {
  const [partySize, setPartySize] = useState(reservation.partySize);
  const [tableId, setTableId] = useState(reservation.tableId);
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [startTime, setStartTime] = useState(
    new Date(reservation.startTime).toTimeString().slice(0, 5)
  );
  const [endTime, setEndTime] = useState(
    new Date(reservation.endTime).toTimeString().slice(0, 5)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const dateStr = reservation.date.split("T")[0];
      await onSave(reservation.id, {
        partySize,
        tableId,
        notes: notes || undefined,
        startTime: `${dateStr}T${startTime}:00.000Z`,
        endTime: `${dateStr}T${endTime}:00.000Z`,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Edit Reservation</h3>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSave} className={styles.form}>
          <label className={styles.field}>
            <span>Start Time</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>End Time</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Party Size</span>
            <input
              type="number"
              value={partySize}
              onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={20}
            />
          </label>
          <label className={styles.field}>
            <span>Table</span>
            <select value={tableId} onChange={(e) => setTableId(e.target.value)}>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (seats {t.capacity})
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CSS module**

Drawer slides in from the right. Use `position: fixed; right: 0; top: 0; height: 100vh; width: 400px;` with backdrop overlay. Use Rialto tokens.

- [ ] **Step 3: Commit**

```bash
git add apps/hospitality/src/components/timeline/EditReservationDrawer.*
git commit -m "feat: add EditReservationDrawer component"
```

### Task 11: Walk-in Dialog

**Files:**

- Create: `apps/hospitality/src/components/timeline/WalkInDialog.tsx`
- Create: `apps/hospitality/src/components/timeline/WalkInDialog.module.css`

- [ ] **Step 1: Create WalkInDialog**

Party size selector, auto-suggest best table (smallest available capacity >= party size), optional guest name, confirm button.

```typescript
import { useState, useMemo } from "react";
import type { Table } from "@mbe/types";
import styles from "./WalkInDialog.module.css";

interface WalkInDialogProps {
  tables: Table[];
  venueId: string;
  onConfirm: (data: {
    partySize: number;
    tableId: string;
    venueId: string;
    guestName?: string;
  }) => Promise<void>;
  onClose: () => void;
}

export function WalkInDialog({ tables, venueId, onConfirm, onClose }: WalkInDialogProps) {
  const [partySize, setPartySize] = useState(2);
  const [guestName, setGuestName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableTables = useMemo(
    () =>
      tables
        .filter((t) => t.isActive && t.status === "AVAILABLE" && t.capacity >= partySize)
        .sort((a, b) => a.capacity - b.capacity),
    [tables, partySize]
  );

  const [selectedTableId, setSelectedTableId] = useState<string>(
    availableTables[0]?.id ?? ""
  );

  // Update selected table when party size changes
  const bestTable = availableTables[0];
  const effectiveTableId = availableTables.some((t) => t.id === selectedTableId)
    ? selectedTableId
    : bestTable?.id ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveTableId) return;
    setIsSubmitting(true);
    try {
      await onConfirm({
        partySize,
        tableId: effectiveTableId,
        venueId,
        guestName: guestName.trim() || undefined,
      });
      onClose();
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Seat Walk-in</h3>
        <form onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Party Size</span>
            <div className={styles.partySizeButtons}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`${styles.sizeBtn} ${partySize === n ? styles.sizeBtnActive : ""}`}
                  onClick={() => {
                    setPartySize(n);
                    const newBest = tables.find(
                      (t) => t.isActive && t.status === "AVAILABLE" && t.capacity >= n
                    );
                    if (newBest) setSelectedTableId(newBest.id);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </label>
          <label className={styles.field}>
            <span>Table</span>
            {availableTables.length === 0 ? (
              <p className={styles.noTables}>No available tables for this party size</p>
            ) : (
              <select
                value={effectiveTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
              >
                {availableTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (seats {t.capacity})
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className={styles.field}>
            <span>Guest Name (optional)</span>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Walk-in"
            />
          </label>
          <div className={styles.actions}>
            <button type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button
              type="submit"
              className={styles.seatBtn}
              disabled={isSubmitting || !effectiveTableId}
            >
              {isSubmitting ? "Seating..." : "Seat Now"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CSS module**

Style consistently with other dialogs. Party size buttons in a horizontal row. "Seat Now" button should be prominent (green/primary).

- [ ] **Step 3: Commit**

```bash
git add apps/hospitality/src/components/timeline/WalkInDialog.*
git commit -m "feat: add WalkInDialog component"
```

### Task 12: Wire Actions into Timeline Page

**Files:**

- Modify: `apps/hospitality/src/pages/TimelinePage.tsx`

This is the main integration task. Wire up the Seat/Edit/Cancel buttons and add the Walk-in button.

- [ ] **Step 1: Add dialog state variables**

```typescript
const [showCancelDialog, setShowCancelDialog] = useState(false);
const [showEditDrawer, setShowEditDrawer] = useState(false);
const [showWalkInDialog, setShowWalkInDialog] = useState(false);
```

- [ ] **Step 2: Add action handlers**

```typescript
const handleSeat = async (reservation: Reservation) => {
  await api.reservations.update(reservation.id, { status: "COMPLETED" });
  await api.tables.updateStatus(reservation.tableId, "OCCUPIED");
  setReservations((prev) =>
    prev.map((r) => (r.id === reservation.id ? { ...r, status: "COMPLETED" } : r))
  );
  setTables((prev) =>
    prev.map((t) => (t.id === reservation.tableId ? { ...t, status: "OCCUPIED" } : t))
  );
  setSelectedReservation(null);
};

const handleCancel = async (reason: string, note: string) => {
  if (!selectedReservation) return;
  await api.reservations.cancelWithReason(selectedReservation.id, {
    cancellationReason: reason,
    cancellationNote: note,
  });
  setReservations((prev) =>
    prev.map((r) => (r.id === selectedReservation.id ? { ...r, status: "CANCELLED" } : r))
  );
  setSelectedReservation(null);
};

const handleEdit = async (id: string, data: UpdateReservationRequest) => {
  const updated = await api.reservations.update(id, data);
  setReservations((prev) => prev.map((r) => (r.id === id ? updated : r)));
  setSelectedReservation(updated);
};

const handleWalkIn = async (data: {
  partySize: number;
  tableId: string;
  venueId: string;
  guestName?: string;
}) => {
  const reservation = await api.reservations.walkIn(data);
  setReservations((prev) => [...prev, reservation]);
  setTables((prev) => prev.map((t) => (t.id === data.tableId ? { ...t, status: "OCCUPIED" } : t)));
};
```

- [ ] **Step 3: Wire buttons in the reservation sidebar**

Find the existing Seat/Edit/Cancel buttons in the sidebar (around lines 370-390) and wire them:

```tsx
<button onClick={() => handleSeat(selectedReservation)}>Seat</button>
<button onClick={() => setShowEditDrawer(true)}>Edit</button>
<button onClick={() => setShowCancelDialog(true)}>Cancel</button>
```

- [ ] **Step 4: Add Walk-in button to the header**

In the header area next to the date navigation (around line 240), add:

```tsx
<button className={styles.walkInBtn} onClick={() => setShowWalkInDialog(true)}>
  + Walk-in
</button>
```

- [ ] **Step 5: Render dialogs conditionally**

At the end of the component return:

```tsx
{
  showCancelDialog && selectedReservation && (
    <CancelReservationDialog
      reservationId={selectedReservation.id}
      guestName={selectedReservation.guestName}
      onConfirm={handleCancel}
      onClose={() => setShowCancelDialog(false)}
    />
  );
}
{
  showEditDrawer && selectedReservation && (
    <EditReservationDrawer
      reservation={selectedReservation}
      tables={tables}
      onSave={handleEdit}
      onClose={() => setShowEditDrawer(false)}
    />
  );
}
{
  showWalkInDialog && selectedVenueId && (
    <WalkInDialog
      tables={tables}
      venueId={selectedVenueId}
      onConfirm={handleWalkIn}
      onClose={() => setShowWalkInDialog(false)}
    />
  );
}
```

- [ ] **Step 6: Add table status handler to SSE hook**

In the `useReservationEvents` call, add the `onTableUpdated` callback:

```typescript
onTableUpdated: (table) => {
  setTables((prev) => prev.map((t) => (t.id === table.id ? table : t)));
},
```

- [ ] **Step 7: Verify the app builds**

Run: `pnpm build --filter=@mbe/hospitality`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add apps/hospitality/src/
git commit -m "feat: wire timeline actions — seat, edit, cancel, walk-in"
```

---

## Chunk 5: Table Status Visual Indicators

### Task 13: Table Status Badge Component

**Files:**

- Create: `apps/hospitality/src/components/TableStatusBadge.tsx`
- Create: `apps/hospitality/src/components/TableStatusBadge.module.css`

- [ ] **Step 1: Create TableStatusBadge**

```typescript
import type { TableStatus } from "@mbe/types";
import styles from "./TableStatusBadge.module.css";

interface TableStatusBadgeProps {
  status: TableStatus;
  size?: "sm" | "md";
}

const STATUS_LABELS: Record<TableStatus, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  DIRTY: "Dirty",
  READY: "Ready",
};

export function TableStatusBadge({ status, size = "sm" }: TableStatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[status.toLowerCase()]} ${styles[size]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 2: Create CSS module**

Colors:

- AVAILABLE: green (#dcfce7 bg, #166534 text)
- OCCUPIED: blue (#dbeafe bg, #1e40af text)
- DIRTY: amber (#fef3c7 bg, #92400e text)
- READY: gray (#f3f4f6 bg, #374151 text)

- [ ] **Step 3: Commit**

```bash
git add apps/hospitality/src/components/TableStatusBadge.*
git commit -m "feat: add TableStatusBadge component"
```

### Task 14: Show Status in Timeline Grid

**Files:**

- Modify: `apps/hospitality/src/components/timeline/TimelineGrid.tsx`
- Modify: `apps/hospitality/src/components/timeline/TimelineGrid.module.css`

- [ ] **Step 1: Add status indicator to table name column**

In the table row (around line 120), add the `TableStatusBadge` next to the table name:

```tsx
<div className={styles.tableName}>
  <span>{table.name}</span>
  <TableStatusBadge status={table.status} size="sm" />
</div>
```

- [ ] **Step 2: Add status toggle buttons**

Add clickable status cycle in the table name cell. Clicking the badge cycles: AVAILABLE → OCCUPIED → DIRTY → AVAILABLE (for manual overrides like marking a table clean).

Add an `onTableStatusChange` prop to `TimelineGridProps`:

```typescript
onTableStatusChange?: (tableId: string, status: TableStatus) => void;
```

- [ ] **Step 3: Update CSS for the status badge placement**

Ensure the badge fits within the sticky table column without breaking layout.

- [ ] **Step 4: Wire status change in TimelinePage**

Pass the handler from TimelinePage:

```typescript
const handleTableStatusChange = async (tableId: string, status: TableStatus) => {
  await api.tables.updateStatus(tableId, status);
  setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, status } : t)));
};
```

- [ ] **Step 5: Verify build**

Run: `pnpm build --filter=@mbe/hospitality`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add apps/hospitality/src/
git commit -m "feat: show table status in timeline grid with toggle"
```

---

## Chunk 6: Final Verification

### Task 15: Full Build & Test Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd services/reservations && pnpm test
```

Expected: All tests PASS

- [ ] **Step 2: Run linting**

```bash
pnpm lint
```

Expected: No errors

- [ ] **Step 3: Run type checking**

```bash
pnpm typecheck
```

Expected: No errors

- [ ] **Step 4: Build everything**

```bash
pnpm build
```

Expected: All packages and apps build successfully

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address lint/type/test issues from core operations"
```
