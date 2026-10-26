import type { ClosureAction } from "@mbe/types";
import type { PrismaClient } from "../generated/prisma/index.js";
import {
  recordReservationEvent,
  staffActor,
  toEventState,
  type EventState,
} from "./reservation-events.js";
import { tableAdvisoryLockSql } from "./book-slot.js";
import { ReservationTransitionError, transitionReservation } from "./reservation-state-machine.js";
import {
  activeHoldWindow,
  NOT_BOOKED_STATUSES,
  overlapWindow,
  serviceDayConflictWindow,
} from "./slot-rules.js";

/**
 * The reservation transitions of a closure, applied inside the closure's own
 * transaction (architecture.md § Closure command), so a saved closure implies
 * "no active reservation overlaps it unless the outcome is keep" by
 * construction. No Stripe call is made here: a cancelled booking's deposit
 * stays `held` and its outcome `refund: pending` for the CLOSURE_REFUND job
 * (#7524) to settle through `DepositService`, keyed `closure:<ruleId>:<reservationId>`.
 * No guest notice either (#7523).
 */

type Tx = Pick<
  PrismaClient,
  "reservation" | "reservationEvent" | "reservationHold" | "$executeRaw"
>;

export interface PlannedTransition {
  reservationId: string;
  action: ClosureAction;
  movedTo: Date | null;
}

export type ApplyResult =
  | { kind: "ok" }
  | { kind: "move_conflict"; reservationIds: string[] }
  | { kind: "cannot_cancel"; reservationId: string; detail: string };

interface Existing {
  id: string;
  status: string;
  tableId: string | null;
  date: Date;
  startTime: Date;
  endTime: Date;
  partySize: number;
}

const stateOf = (r: Existing, patch: Partial<Existing> = {}): EventState =>
  toEventState({ ...r, ...patch, tableId: patch.tableId ?? r.tableId ?? "" });

/** Cancel by the venue: the status CAS plus the event, no money moved. */
async function cancelInTx(
  tx: Tx,
  venueId: string,
  actorId: string,
  r: Existing
): Promise<ApplyResult> {
  try {
    transitionReservation(r.status as never, "CANCELLED");
  } catch (error) {
    if (error instanceof ReservationTransitionError) {
      return { kind: "cannot_cancel", reservationId: r.id, detail: error.message };
    }
    throw error;
  }
  const { count } = await tx.reservation.updateMany({
    where: { id: r.id, venueId, status: r.status as never },
    data: {
      status: "CANCELLED",
      cancellationReason: "venue_closure",
      cancellationNote: "Cancelled by the venue: closure",
    },
  });
  if (count === 0) {
    return { kind: "cannot_cancel", reservationId: r.id, detail: "Reservation changed meanwhile" };
  }
  await recordReservationEvent(tx as never, {
    reservationId: r.id,
    venueId,
    kind: "cancelled",
    actor: staffActor(actorId),
    from: stateOf(r),
    to: stateOf(r, { status: "CANCELLED" }),
  });
  return { kind: "ok" };
}

/**
 * Whether the move's target window is taken on the table. Takes bookSlot's
 * per-table advisory lock first, so a concurrent booking cannot slip in
 * between this check and the write, then applies bookSlot's two checks: an
 * overlapping booking, and an unexpired hold (`checkHoldConflict`).
 */
async function targetTaken(
  tx: Tx,
  venueId: string,
  r: Existing,
  startTime: Date,
  endTime: Date
): Promise<boolean> {
  const tableId = r.tableId as string;
  await tx.$executeRaw(tableAdvisoryLockSql(tableId));
  const clash = await tx.reservation.findFirst({
    where: {
      venueId,
      tableId,
      id: { not: r.id },
      status: { notIn: [...NOT_BOOKED_STATUSES] },
      ...overlapWindow(startTime, endTime),
    },
    select: { id: true },
  });
  if (clash) return true;
  const hold = await tx.reservationHold.findFirst({
    where: {
      tableId,
      date: serviceDayConflictWindow(r.date),
      expiresAt: activeHoldWindow(new Date()),
      ...overlapWindow(startTime, endTime),
    },
    select: { id: true },
  });
  return hold !== null;
}

/** Move to the planned start, keeping the length; false when the table is taken then. */
async function moveInTx(
  tx: Tx,
  venueId: string,
  actorId: string,
  r: Existing,
  startTime: Date
): Promise<boolean> {
  const endTime = new Date(startTime.getTime() + (r.endTime.getTime() - r.startTime.getTime()));
  if (r.tableId && (await targetTaken(tx, venueId, r, startTime, endTime))) return false;
  const { count } = await tx.reservation.updateMany({
    where: { id: r.id, venueId, status: r.status as never },
    data: { startTime, endTime },
  });
  if (count === 0) return false;
  await recordReservationEvent(tx as never, {
    reservationId: r.id,
    venueId,
    kind: "moved",
    actor: staffActor(actorId),
    from: stateOf(r),
    to: stateOf(r, { startTime, endTime }),
  });
  return true;
}

/** Cancels first (they free tables), then moves; a move that cannot land refuses the lot. */
export async function applyTransitions(
  tx: Tx,
  venueId: string,
  actorId: string,
  planned: readonly PlannedTransition[]
): Promise<ApplyResult> {
  const work = planned.filter((p) => p.action === "cancel" || p.action === "move");
  if (work.length === 0) return { kind: "ok" };
  const rows = await tx.reservation.findMany({
    where: { venueId, id: { in: work.map((p) => p.reservationId) } },
    select: {
      id: true,
      status: true,
      tableId: true,
      date: true,
      startTime: true,
      endTime: true,
      partySize: true,
    },
  });
  const byId = new Map<string, Existing>(rows.map((r) => [r.id, r as Existing]));
  const ordered = [...work].sort(
    (a, b) => Number(a.action === "move") - Number(b.action === "move")
  );
  const conflicts: string[] = [];
  for (const p of ordered) {
    const r = byId.get(p.reservationId);
    if (!r) continue;
    if (p.action === "cancel") {
      const result = await cancelInTx(tx, venueId, actorId, r);
      if (result.kind !== "ok") return result;
    } else if (!(await moveInTx(tx, venueId, actorId, r, p.movedTo as Date))) {
      conflicts.push(r.id);
    }
  }
  return conflicts.length > 0
    ? { kind: "move_conflict", reservationIds: conflicts }
    : { kind: "ok" };
}
