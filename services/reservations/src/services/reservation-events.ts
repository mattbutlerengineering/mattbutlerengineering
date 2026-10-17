import type { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

export const RESERVATION_EVENT_KINDS = [
  "created",
  "status_changed",
  "cancelled",
  "no_show",
  "moved",
  "updated",
  "deposit_transition",
  "transition_rejected",
] as const;

export type ReservationEventKind = (typeof RESERVATION_EVENT_KINDS)[number];

/** Guest `id` is the reservation's `guestId` — never a manage token or other capability secret. */
export type ReservationEventActor =
  | { type: "staff"; id: string }
  | { type: "guest"; id: string | null }
  | { type: "system"; id: string };

/** Default for callers whose actor is not threaded through yet. */
export const SYSTEM_ACTOR: ReservationEventActor = { type: "system", id: "unattributed" };

/** The guest door's actor; `guestId` is null until a guest record exists. */
export const guestActor = (guestId: string | null | undefined): ReservationEventActor => ({
  type: "guest",
  id: guestId ?? null,
});

/** The authenticated user as a staff actor; the system actor when there is no user. */
export const staffActor = (userId: string | null | undefined): ReservationEventActor =>
  userId ? { type: "staff", id: userId } : SYSTEM_ACTOR;

/** Non-PII scheduling snapshot stored in `from_state` / `to_state`. */
export type EventState = {
  status: string;
  tableId: string;
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
};

/** Deposit status snapshot stored in `from_state` / `to_state` of a `deposit_transition` event. */
export type DepositEventState = { depositStatus: string };

export function toEventState(row: {
  status: string;
  tableId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  partySize: number;
}): EventState {
  return {
    status: row.status,
    tableId: row.tableId,
    date: row.date.toISOString(),
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    partySize: row.partySize,
  };
}

/**
 * Appends one event row inside the caller's venue-scoped transaction. Takes the
 * transaction client so the auto-wrapped `prisma` singleton cannot be passed.
 * A NULL-venue row cannot pass RLS, so a null `venueId` writes nothing.
 */
export async function recordReservationEvent(
  tx: Prisma.TransactionClient,
  input: {
    reservationId: string;
    venueId: string | null;
    kind: ReservationEventKind;
    actor: ReservationEventActor;
    from?: EventState | DepositEventState | null;
    to?: EventState | DepositEventState | null;
  }
) {
  if (input.venueId === null) return null;
  return tx.reservationEvent.create({
    data: {
      reservationId: input.reservationId,
      venueId: input.venueId,
      kind: input.kind,
      actorType: input.actor.type,
      actorId: input.actor.id,
      fromState: input.from ?? undefined,
      toState: input.to ?? undefined,
    },
  });
}

export const DEFAULT_EVENT_PAGE_SIZE = 50;
export const MAX_EVENT_PAGE_SIZE = 200;

/** One history entry as the API returns it; the venue and reservation ids stay server-side. */
export interface ReservationEventDto {
  id: string;
  kind: string;
  actorType: string;
  actorId: string | null;
  fromState: unknown;
  toState: unknown;
  createdAt: string;
}

export class InvalidEventCursorError extends Error {
  constructor() {
    super("Invalid cursor");
  }
}

const encodeCursor = (row: { id: string; createdAt: Date }): string =>
  Buffer.from(JSON.stringify({ t: row.createdAt.toISOString(), id: row.id })).toString("base64url");

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const { t, id } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const createdAt = new Date(t);
    if (typeof id !== "string" || typeof t !== "string" || Number.isNaN(createdAt.getTime())) {
      throw new InvalidEventCursorError();
    }
    return { createdAt, id };
  } catch {
    throw new InvalidEventCursorError();
  }
}

/**
 * A reservation's history, oldest first. Keyset-paginated on `(createdAt, id)`
 * with an opaque cursor so rows appended mid-read are neither skipped nor
 * repeated. Runs inside the caller's venue context, so RLS bounds the rows.
 */
export async function listForReservation(
  reservationId: string,
  { limit = DEFAULT_EVENT_PAGE_SIZE, cursor }: { limit?: number; cursor?: string } = {}
): Promise<{ data: ReservationEventDto[]; nextCursor: string | null }> {
  const after = cursor === undefined ? undefined : decodeCursor(cursor);
  const rows = await prisma.reservationEvent.findMany({
    where: {
      reservationId,
      ...(after && {
        OR: [
          { createdAt: { gt: after.createdAt } },
          { createdAt: after.createdAt, id: { gt: after.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return {
    data: page.map((row) => ({
      id: row.id,
      kind: row.kind,
      actorType: row.actorType,
      actorId: row.actorId,
      fromState: row.fromState,
      toState: row.toState,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]!) : null,
  };
}
