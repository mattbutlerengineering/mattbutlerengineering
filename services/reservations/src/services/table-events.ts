import type { Prisma, TableStatus } from "../generated/prisma/index.js";

export type TableEventActor = { type: "staff"; id: string } | { type: "system"; id: string | null };

/** For transitions with no user behind them. */
export const SYSTEM_TABLE_ACTOR: TableEventActor = { type: "system", id: null };

/** The authenticated user as a staff actor; the system actor when there is no user. */
export const staffTableActor = (userId: string | null | undefined): TableEventActor =>
  userId ? { type: "staff", id: userId } : SYSTEM_TABLE_ACTOR;

/**
 * Appends one event row inside the caller's venue-scoped transaction. Takes the
 * transaction client so the auto-wrapped `prisma` singleton cannot be passed.
 * A NULL-venue row cannot pass RLS, so a null `venueId` writes nothing.
 */
export async function recordTableEvent(
  tx: Prisma.TransactionClient,
  input: {
    tableId: string;
    venueId: string | null;
    fromStatus: TableStatus;
    toStatus: TableStatus;
    actor: TableEventActor;
    reservationId?: string | null;
  }
) {
  if (input.venueId === null) return null;
  return tx.tableEvent.create({
    data: {
      tableId: input.tableId,
      venueId: input.venueId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorType: input.actor.type,
      actorId: input.actor.id,
      reservationId: input.reservationId ?? null,
    },
  });
}
