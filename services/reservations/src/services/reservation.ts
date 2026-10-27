import {
  toDateString,
  tableMaxCovers,
  partyFitsTable,
  type Reservation,
  type ReservationStatus,
  type Table,
  type CreateReservationRequest,
  type UpdateReservationRequest,
  type WalkInRequest,
  type PaginatedResponse,
  type ConflictCheckResult,
  type PacingCheckResult,
  type VenueSettings,
} from "@mbe/types";
import { paginate, toPaginationMeta, isPrismaNotFound } from "@mbe/database";
import type { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { assumeAppRole } from "./assume-app-role.js";
import { getCurrentVenueId, runWithVenueContext } from "./venue-context-store.js";
import { availabilityService } from "./availability.js";
import { assertBookable, type GateRejection } from "./assert-bookable.js";
import { NOT_BOOKED_STATUSES, venueLocalDateString } from "./slot-rules.js";
import { bookSlot, type SlotConflict } from "./book-slot.js";
import { toReservation, toTable } from "./serializers.js";
import { transitionReservation, ReservationTransitionError } from "./reservation-state-machine.js";
import { guestService } from "./guest.js";
import { recordTableEvent, SYSTEM_TABLE_ACTOR } from "./table-events.js";
import {
  recordReservationEvent,
  toEventState,
  SYSTEM_ACTOR,
  type EventState,
  type ReservationEventActor,
} from "./reservation-events.js";
import { isTableInVenue, loadTableFit, TABLE_NOT_IN_VENUE_DETAIL } from "./table-venue.js";

export { ReservationTransitionError };

/** The result every write returns when its table belongs to another venue. */
const TABLE_NOT_IN_VENUE = {
  success: false,
  error: TABLE_NOT_IN_VENUE_DETAIL,
  tableNotInVenue: true,
} as const;

export interface ListReservationsOptions {
  page: number;
  limit: number;
  date?: string;
  status?: ReservationStatus;
  tableId?: string;
  venueId?: string;
  guestId?: string;
}

export interface CreateReservationResult {
  success: boolean;
  reservation?: Reservation;
  /**
   * The table whose status was changed as part of creating the reservation.
   * Set by {@link reservationService.createWalkIn} when it flips the table to
   * OCCUPIED in the same transaction as the reservation insert, so the route
   * can emit the `table:updated` SSE event only after the commit succeeds.
   */
  table?: Table;
  error?: string;
  conflict?: ConflictCheckResult;
  pacing?: PacingCheckResult;
  /** The requested table is missing or belongs to another venue (route answers 403). */
  tableNotInVenue?: boolean;
  /** The party does not fit the caller-named table (route answers 422). */
  partyDoesNotFit?: boolean;
  /** The availability gate refused the slot (route answers 422 via `gateProblem`). */
  rejection?: GateRejection;
}

/** True when the patch moves the reservation's slot (date, time or table). */
function isSlotMove(data: UpdateReservationRequest): boolean {
  return (
    data.date !== undefined ||
    data.startTime !== undefined ||
    data.endTime !== undefined ||
    data.tableId !== undefined
  );
}

export interface UpdateReservationResult {
  success: boolean;
  reservation?: Reservation;
  error?: string;
  conflict?: ConflictCheckResult;
  capacityExceeded?: boolean;
  /** The requested table is missing or belongs to another venue (route answers 403). */
  tableNotInVenue?: boolean;
  /** The availability gate refused the slot (route answers 422 via `gateProblem`). */
  rejection?: GateRejection;
}

/**
 * The columns that record a staff override. Only the limits the gate actually
 * passed count: an override sent for a slot that needed none is not stored.
 */
function overrideColumns(override: { reason: string } | undefined, limits: string[] | undefined) {
  if (!override || !limits || limits.length === 0) return {};
  return { overrideReason: override.reason.trim(), overrideLimits: limits };
}

/** A staff create or move that {@link bookSlot} refused: the gate's verdict, else a conflict. */
function staffSlotFailure(conflict: SlotConflict) {
  if (conflict.code === "NOT_BOOKABLE") {
    return { success: false, error: conflict.message, rejection: conflict.rejection } as const;
  }
  return {
    success: false,
    error: "Time slot has a conflict with an existing reservation or hold",
    conflict: { hasConflict: true },
  } as const;
}

/**
 * Merge-sort comparator matching `listByUserId`'s pre-#5369 `orderBy: [{
 * date: "desc" }, { startTime: "desc" }]` — needed once the per-venue fan-out
 * replaces that single query's own ordering with an in-process merge.
 */
function compareReservationDateDesc(
  a: { date: Date; startTime: Date },
  b: { date: Date; startTime: Date }
): number {
  const dateDiff = b.date.getTime() - a.date.getTime();
  return dateDiff !== 0 ? dateDiff : b.startTime.getTime() - a.startTime.getTime();
}

export const reservationService = {
  async list(options: ListReservationsOptions): Promise<PaginatedResponse<Reservation>> {
    const { page, limit, date, status, tableId, venueId, guestId } = options;

    const where: Record<string, unknown> = {};
    if (date) {
      where.date = new Date(date);
    }
    if (status) {
      where.status = status;
    }
    if (tableId) {
      where.tableId = tableId;
    }
    if (venueId) {
      where.venueId = venueId;
    }
    if (guestId) {
      where.guestId = guestId;
    }

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        ...paginate({ page, limit }),
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        include: {
          table: true,
          guest: {
            select: { visitCount: true, communicationPreference: true, unsubscribed: true },
          },
        },
      }),
      prisma.reservation.count({ where }),
    ]);

    return {
      data: reservations.map(toReservation),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  /**
   * A diner's own reservations can span whatever venues they booked at
   * (ADR-026 §3.2 item 2, #5369) — a single `reservation.findMany({ where:
   * { userId } })` has no single venue to name, so it returns ZERO rows under
   * `FORCE ROW LEVEL SECURITY`. Fixed the same way as
   * {@link venueService.listForMember}: resolve the set of venues this user's
   * reservations span via `app_reservation_venue_ids_for_user()` (a
   * `SECURITY DEFINER` function, `prisma/migrations/20260925010000_add_rls_venue_resolution_functions`
   * — returns venue ids only, never a reservation row), then read each venue's
   * reservations inside its own `runWithVenueContext` and merge. Pagination
   * moves from the database into this function because the fan-out can no
   * longer express it as one query; the merge sort keeps today's
   * `date desc, startTime desc` ordering.
   */
  async listByUserId(
    userId: string,
    page: number,
    limit: number
  ): Promise<PaginatedResponse<Reservation>> {
    const venueRows = await prisma.$transaction(async (tx) => {
      await assumeAppRole(tx);
      return tx.$queryRaw<{ app_reservation_venue_ids_for_user: string }[]>`
        SELECT * FROM app_reservation_venue_ids_for_user(${userId})`;
    });

    const perVenue = await Promise.all(
      venueRows.map(({ app_reservation_venue_ids_for_user: venueId }) =>
        runWithVenueContext(venueId, () =>
          prisma.reservation.findMany({
            where: { userId, venueId },
            orderBy: [{ date: "desc" }, { startTime: "desc" }],
            include: {
              table: true,
              guest: {
                select: { visitCount: true, communicationPreference: true, unsubscribed: true },
              },
            },
          })
        )
      )
    );

    const reservations = perVenue.flat().sort(compareReservationDateDesc);
    const { skip, take } = paginate({ page, limit });

    return {
      data: reservations.slice(skip, skip + take).map(toReservation),
      pagination: toPaginationMeta(page, limit, reservations.length),
    };
  },

  async getById(id: string): Promise<Reservation | null> {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        table: true,
        guest: { select: { visitCount: true, communicationPreference: true, unsubscribed: true } },
      },
    });
    return reservation ? toReservation(reservation) : null;
  },

  /**
   * The booking-widget session that confirmed this reservation (#6304), or
   * `null` when the reservation does not exist or was created outside the
   * widget. Kept off the serialized `Reservation` so the capability token is
   * never echoed in an API response.
   */
  async getOriginSessionId(id: string): Promise<string | null> {
    const row = await prisma.reservation.findUnique({
      where: { id },
      select: { originSessionId: true },
    });
    return row?.originSessionId ?? null;
  },

  async create(
    data: CreateReservationRequest,
    userId?: string,
    actor: ReservationEventActor = SYSTEM_ACTOR
  ): Promise<Reservation> {
    // Explicit transaction so the `created` event joins the insert. This call
    // bypasses the per-call auto-wrap in `services/venue-scoped-prisma.ts`, so
    // set app.venue_id on THIS transaction's own `tx` (ADR-026 part 6).
    const reservation = await prisma.$transaction(async (tx) => {
      await setVenueContext(tx, getCurrentVenueId());
      const created = await tx.reservation.create({
        data: {
          date: new Date(data.date),
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
          partySize: data.partySize,
          tableId: data.tableId,
          notes: data.notes ?? null,
          occasion: data.occasion ?? null,
          seatingPreference: data.seatingPreference ?? null,
          guestName: data.guestName ?? null,
          guestEmail: data.guestEmail ?? null,
          guestPhone: data.guestPhone ?? null,
          guestId: data.guestId ?? null,
          userId: userId ?? null,
          venueId: data.venueId ?? null,
        },
        include: {
          table: true,
          guest: {
            select: { visitCount: true, communicationPreference: true, unsubscribed: true },
          },
        },
      });
      await recordReservationEvent(tx, {
        reservationId: created.id,
        venueId: created.venueId,
        kind: "created",
        actor,
        from: null,
        to: toEventState(created),
      });
      return created;
    });
    return toReservation(reservation);
  },

  /**
   * Creates a reservation with conflict and pacing checks.
   * Used for staff direct booking (bypassing hold flow).
   */
  async createWithConflictCheck(
    data: CreateReservationRequest,
    userId?: string,
    actor: ReservationEventActor = SYSTEM_ACTOR
  ): Promise<CreateReservationResult> {
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);

    // The named venue must own the table, checked before any conflict data is
    // read so the conflict answer can't reveal another venue's bookings.
    if (data.venueId && !(await isTableInVenue(data.tableId, data.venueId))) {
      return TABLE_NOT_IN_VENUE;
    }

    // Resolve the venue used for the pacing pre-check and the pacing/conflict
    // re-check under the lock. Prefer the request's venueId, else the table's.
    const venueId =
      data.venueId ??
      (await prisma.table.findUnique({ where: { id: data.tableId }, select: { venueId: true } }))
        ?.venueId ??
      null;

    if (venueId) {
      // Fetch venue settings + conflict slices once, then evaluate the single
      // canonical booking invariant (party fit + conflict) through assertBookable —
      // the same seam confirmHold and createWalkIn cross. Pacing is NOT checked
      // here (settings: null): it is a soft limit the booking gate judges below,
      // so a staff override with a reason can pass it.
      const { reservations, holds } = await availabilityService.fetchConflictData(
        venueId,
        data.date
      );

      const bookingError = assertBookable({
        tableId: data.tableId,
        table: await loadTableFit(data.tableId),
        window: { startTime, endTime },
        partySize: data.partySize,
        settings: null,
        reservations,
        holds,
      });

      if (bookingError?.code === "PARTY_DOES_NOT_FIT") {
        return { success: false, error: bookingError.message, partyDoesNotFit: true };
      }
      if (bookingError?.code === "CONFLICT") {
        return {
          success: false,
          error: "Time slot has a conflict with an existing reservation or hold",
          conflict: { hasConflict: true },
        };
      }
    }

    // Restore the advisory-lock + transaction this staff-booking path silently
    // dropped: re-check conflicts under the per-table lock before committing so
    // two concurrent bookings of the same slot cannot both insert (#3113).
    const result = await bookSlot({
      tableId: data.tableId,
      venueId,
      date: new Date(data.date),
      window: { startTime, endTime },
      partySize: data.partySize,
      checkHoldConflict: true,
      gate: { channel: "phone", override: data.override },
      write: async (tx, gated) => {
        const created = await tx.reservation.create({
          data: {
            date: new Date(data.date),
            startTime,
            endTime,
            partySize: data.partySize,
            tableId: data.tableId,
            notes: data.notes ?? null,
            occasion: data.occasion ?? null,
            seatingPreference: data.seatingPreference ?? null,
            guestName: data.guestName ?? null,
            guestEmail: data.guestEmail ?? null,
            guestPhone: data.guestPhone ?? null,
            guestId: data.guestId ?? null,
            userId: userId ?? null,
            venueId: data.venueId ?? null,
            ...overrideColumns(data.override, gated.overrideLimits),
          },
          include: {
            table: true,
            guest: {
              select: { visitCount: true, communicationPreference: true, unsubscribed: true },
            },
          },
        });
        await recordReservationEvent(tx, {
          reservationId: created.id,
          venueId: created.venueId,
          kind: "created",
          actor,
          from: null,
          to: toEventState(created),
        });
        return created;
      },
    });

    if (!result.ok) return staffSlotFailure(result.conflict);

    return { success: true, reservation: toReservation(result.value) };
  },

  async update(
    id: string,
    data: UpdateReservationRequest,
    actor: ReservationEventActor = SYSTEM_ACTOR
  ): Promise<Reservation | null> {
    try {
      const updateData = {
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.startTime !== undefined && {
          startTime: new Date(data.startTime),
        }),
        ...(data.endTime !== undefined && { endTime: new Date(data.endTime) }),
        ...(data.partySize !== undefined && { partySize: data.partySize }),
        ...(data.tableId !== undefined && { tableId: data.tableId }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.occasion !== undefined && { occasion: data.occasion }),
        ...(data.seatingPreference !== undefined && { seatingPreference: data.seatingPreference }),
        ...(data.cancellationReason !== undefined && {
          cancellationReason: data.cancellationReason,
        }),
        ...(data.cancellationNote !== undefined && { cancellationNote: data.cancellationNote }),
      };

      // Status transitions go through an atomic compare-and-swap guarded on the
      // status we validated against, mirroring the deposit-service CAS
      // (`prisma.deposit.updateMany({ where: { id, status } })`). A bare
      // `update({ where: { id } })` lets two concurrent transitions — e.g.
      // duplicate cancel requests — both pass the state-machine check against
      // the same status snapshot and both write, firing duplicate
      // notifications. `count === 0` means another transition won the race;
      // returning null lets the caller short-circuit without re-notifying.
      if (data.status !== undefined) {
        const existing = await prisma.reservation.findUnique({
          where: { id },
          select: {
            status: true,
            guestId: true,
            venueId: true,
            tableId: true,
            date: true,
            startTime: true,
            endTime: true,
            partySize: true,
          },
        });
        if (!existing) return null;
        try {
          // Throws ReservationTransitionError on invalid transition.
          transitionReservation(existing.status, data.status);
        } catch (err: unknown) {
          if (err instanceof ReservationTransitionError) {
            // Leave a trail for the refused transition in its own short
            // venue-scoped transaction, then rethrow unchanged.
            await prisma.$transaction(async (tx) => {
              await setVenueContext(tx, getCurrentVenueId());
              await recordReservationEvent(tx, {
                reservationId: id,
                venueId: existing.venueId,
                kind: "transition_rejected",
                actor,
                from: toEventState(existing),
                to: { status: data.status } as EventState,
              });
            });
          }
          throw err;
        }

        // The status CAS plus write. Shared by both branches below so the
        // NO_SHOW guest-counter bump can be run against the same client
        // (transaction vs. bare prisma) as the status change.
        const writeStatusChange = async (
          client: Prisma.TransactionClient
        ): Promise<Prisma.ReservationGetPayload<{ include: { table: true } }> | null> => {
          const { count } = await client.reservation.updateMany({
            where: { id, status: existing.status },
            data: updateData,
          });
          if (count === 0) return null;

          if (data.status === "NO_SHOW" && existing.guestId) {
            // Bump the guest's no-show counter (and thus risk score, which is
            // derived from it) in the SAME transaction as the status write
            // (#3231). A fire-and-forget write after commit could silently
            // under-count no-shows and never escalate the guest to "risky",
            // losing Deposit protection for exactly the guests who need it.
            await guestService.recordNoShow(existing.guestId, existing.startTime, client);
          }

          if (data.status === "COMPLETED" && existing.guestId) {
            // Count the visit in the SAME transaction as the status CAS. The
            // CAS (`count === 0` returns above) plus the state machine's
            // terminal COMPLETED state mean exactly one caller ever reaches
            // this line per reservation, so visitCount cannot double-count.
            // spendAmount is deliberately omitted: no source captures spend
            // on completion yet, so lifetimeSpend stays untouched.
            await guestService.recordVisit(existing.guestId, existing.startTime, undefined, client);
          }

          const after = await client.reservation.findUnique({
            where: { id },
            include: { table: true },
          });
          if (after) {
            await recordReservationEvent(client, {
              reservationId: id,
              venueId: existing.venueId,
              kind:
                data.status === "CANCELLED"
                  ? "cancelled"
                  : data.status === "NO_SHOW"
                    ? "no_show"
                    : "status_changed",
              actor,
              from: toEventState(existing),
              to: toEventState(after),
            });
          }
          return after;
        };

        // Always an explicit transaction so the CAS, its side effects and the
        // event commit together. This `prisma.$transaction` call bypasses the
        // per-call auto-wrap `services/venue-scoped-prisma.ts` gives the
        // `prisma` export — set app.venue_id on THIS transaction's own `tx`
        // explicitly (ADR-026 part 6).
        const updated = await prisma.$transaction(async (tx) => {
          await setVenueContext(tx, getCurrentVenueId());
          return writeStatusChange(tx);
        });

        return updated ? toReservation(updated) : null;
      }

      const reservation = await prisma.$transaction(async (tx) => {
        await setVenueContext(tx, getCurrentVenueId());
        const before = await tx.reservation.findUnique({
          where: { id },
          select: {
            status: true,
            venueId: true,
            tableId: true,
            date: true,
            startTime: true,
            endTime: true,
            partySize: true,
          },
        });
        if (!before) return null;
        const after = await tx.reservation.update({
          where: { id },
          data: updateData,
          include: { table: true },
        });
        await recordReservationEvent(tx, {
          reservationId: id,
          venueId: before.venueId,
          kind: "updated",
          actor,
          from: toEventState(before),
          to: toEventState(after),
        });
        return after;
      });
      return reservation ? toReservation(reservation) : null;
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  /**
   * Updates a reservation with conflict checking.
   * Checks for conflicts when time or table is changed.
   */
  async updateWithConflictCheck(
    id: string,
    data: UpdateReservationRequest,
    actor: ReservationEventActor = SYSTEM_ACTOR
  ): Promise<UpdateReservationResult> {
    // Get the existing reservation
    const existing = await prisma.reservation.findUnique({
      where: { id },
    });

    if (!existing) {
      return { success: false, error: "Reservation not found" };
    }

    // The move path below writes no status (no state-machine check, status CAS
    // or NO_SHOW/COMPLETED guest side effects), so a payload carrying both
    // would persist the move and silently drop the status (#6882). Refuse it;
    // the caller sends the status change as its own PATCH.
    if (data.status !== undefined && isSlotMove(data)) {
      return {
        success: false,
        error:
          "A status change cannot be combined with a table or time change; send them as separate requests",
      };
    }

    // A cancelled (e.g. by a venue closure) or no-show booking holds no slot:
    // a time/table edit would resurrect its window under a dead status.
    if (isSlotMove(data) && NOT_BOOKED_STATUSES.includes(existing.status)) {
      return { success: false, error: "A cancelled or no-show reservation cannot be moved" };
    }

    // A move onto another venue's table is refused before the capacity and
    // conflict checks, either of which would reveal that table's size or
    // bookings. (A reservation with no venueId never reaches this through a
    // route: resolveVenueId answers null for it and the PATCH route 404s.)
    if (
      data.tableId !== undefined &&
      existing.venueId &&
      !(await isTableInVenue(data.tableId, existing.venueId))
    ) {
      return TABLE_NOT_IN_VENUE;
    }

    // The shared party-fit rule runs whenever partySize OR tableId changes,
    // independent of timeOrTableChanged below — a partySize-only edit is not a
    // slot move, and a table-only move keeps the old party, but either must
    // leave a party that fits the (possibly unchanged) assigned table (#5807,
    // #6559).
    if (data.partySize !== undefined || data.tableId !== undefined) {
      const partySize = data.partySize ?? existing.partySize;
      const table = await loadTableFit(data.tableId ?? existing.tableId);
      if (table && !partyFitsTable(table, partySize)) {
        const ceiling = tableMaxCovers(table);
        return {
          success: false,
          error:
            partySize > ceiling
              ? `Party size ${partySize} exceeds table capacity of ${ceiling}`
              : `Party size ${partySize} is below the table minimum of ${table.minCovers}`,
          capacityExceeded: true,
        };
      }
    }

    // A slot move, or a party-size increase, changes what the slot must hold, so
    // both cross the booking gate (max party, pacing). A status payload never
    // reaches the gated write (it writes no status), so it keeps the plain path.
    const needsGate =
      isSlotMove(data) ||
      (data.status === undefined &&
        data.partySize !== undefined &&
        data.partySize > existing.partySize);

    // Notes / preference / party-size-decrease edits need no gate or lock.
    if (!needsGate) {
      const reservation = await this.update(id, data, actor);
      if (!reservation) {
        return { success: false, error: "Failed to update reservation" };
      }
      return { success: true, reservation };
    }

    // Build the final slot values for the conflict check + the move write.
    const date = data.date ?? toDateString(existing.date);
    const startTime = data.startTime ? new Date(data.startTime) : existing.startTime;
    const endTime = data.endTime ? new Date(data.endTime) : existing.endTime;
    const tableId = data.tableId ?? existing.tableId;

    // Resolve venueId — prefer the reservation's own venueId, fall back to
    // the table's venueId if the reservation was created without one.
    const venueId =
      existing.venueId ??
      (await prisma.table.findUnique({ where: { id: tableId }, select: { venueId: true } }))
        ?.venueId ??
      null;

    if (venueId) {
      // Fetch venue settings + conflict slices once, then evaluate the single
      // canonical booking invariant (conflict) through assertBookable — the same
      // seam every other write path crosses. Exclude the current reservation
      // from the slices so a move doesn't conflict against itself. Pacing is a
      // soft limit judged by the booking gate below (settings: null here), so a
      // staff override with a reason can pass it.
      const { reservations, holds } = await availabilityService.fetchConflictData(venueId, date);
      const filteredReservations = reservations.filter((r) => r.id !== id);

      const bookingError = assertBookable({
        tableId,
        window: { startTime, endTime },
        partySize: data.partySize ?? existing.partySize,
        settings: null,
        reservations: filteredReservations,
        holds,
      });

      if (bookingError?.code === "CONFLICT") {
        return {
          success: false,
          error: "Time slot has a conflict with an existing reservation or hold",
          conflict: { hasConflict: true },
        };
      }
    }

    // Restore the advisory-lock + transaction this move path silently dropped:
    // re-check conflicts under the per-table lock (excluding this reservation)
    // before committing the move so two concurrent moves into the same slot
    // cannot both succeed (#3113). Status transitions never reach this path —
    // the modify route routes cancellations through cancel() — so a plain
    // update (no status CAS) is correct here.
    const updateData = {
      ...(data.date !== undefined && { date: new Date(data.date) }),
      ...(data.startTime !== undefined && { startTime: new Date(data.startTime) }),
      ...(data.endTime !== undefined && { endTime: new Date(data.endTime) }),
      ...(data.partySize !== undefined && { partySize: data.partySize }),
      ...(data.tableId !== undefined && { tableId: data.tableId }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.occasion !== undefined && { occasion: data.occasion }),
      ...(data.seatingPreference !== undefined && { seatingPreference: data.seatingPreference }),
    };

    const result = await bookSlot({
      tableId,
      venueId,
      date: new Date(date),
      window: { startTime, endTime },
      partySize: data.partySize ?? existing.partySize,
      excludeReservationId: id,
      checkHoldConflict: true,
      gate: { channel: "phone", override: data.override, movingFrom: existing.startTime },
      write: async (tx, gated) => {
        try {
          const moved = await tx.reservation.update({
            // Status + start CAS: a closure that cancelled or moved this booking
            // since `existing` was read makes this miss (P2025 -> null below)
            // instead of overwriting the closure's outcome.
            where: { id, status: existing.status, startTime: existing.startTime },
            // A re-judged slot replaces any earlier override: it stays only if
            // this move needed one.
            data: {
              ...updateData,
              overrideReason: null,
              overrideLimits: [],
              ...overrideColumns(data.override, gated.overrideLimits),
            },
            include: { table: true },
          });
          await recordReservationEvent(tx, {
            reservationId: id,
            venueId: existing.venueId,
            kind: isSlotMove(data) ? "moved" : "updated",
            actor,
            from: toEventState(existing),
            to: toEventState(moved),
          });
          return moved;
        } catch (err: unknown) {
          if (isPrismaNotFound(err)) return null;
          throw err;
        }
      },
    });

    if (!result.ok) return staffSlotFailure(result.conflict);

    if (!result.value) {
      return { success: false, error: "Failed to update reservation" };
    }

    return { success: true, reservation: toReservation(result.value) };
  },

  async createWalkIn(
    data: WalkInRequest,
    userId?: string,
    actor: ReservationEventActor = SYSTEM_ACTOR
  ): Promise<CreateReservationResult> {
    const now = new Date();
    const durationMinutes = data.durationMinutes ?? 90;
    const endTime = new Date(now.getTime() + durationMinutes * 60 * 1000);

    // Refuse another venue's table before reading conflict data or flipping
    // its status to OCCUPIED.
    if (!(await isTableInVenue(data.tableId, data.venueId))) {
      return TABLE_NOT_IN_VENUE;
    }

    // Pre-check for conflicts and pacing before the transaction (which re-checks
    // to prevent TOCTOU races). Fetch the conflict slices once and use the
    // canonical assertBookable predicate (conflict + pacing in one call).
    const venue = await prisma.venue.findUnique({ where: { id: data.venueId } });

    // Date only (no time component). Derived from the venue-local calendar
    // date, not `now`'s UTC calendar date — near local midnight for a venue
    // west of UTC those disagree (#5096, same class as #5000's
    // getAvailableDates bucketing bug).
    const dateStr = venueLocalDateString(now, venue?.ianaTimezone ?? "UTC");
    const dateOnly = new Date(dateStr);

    const settings = (venue?.settings ?? null) as VenueSettings | null;
    const { reservations, holds } = await availabilityService.fetchConflictData(
      data.venueId,
      dateStr
    );

    const bookingError = assertBookable({
      tableId: data.tableId,
      table: await loadTableFit(data.tableId),
      window: { startTime: now, endTime },
      partySize: data.partySize,
      settings,
      reservations,
      holds,
    });

    if (bookingError?.code === "PARTY_DOES_NOT_FIT") {
      return { success: false, error: bookingError.message, partyDoesNotFit: true };
    }
    if (bookingError?.code === "CONFLICT") {
      return {
        success: false,
        error: "Table is not available",
        conflict: { hasConflict: true },
      };
    }
    if (bookingError?.code === "PACING_EXCEEDED") {
      return {
        success: false,
        error: bookingError.message,
      };
    }

    // Shares the same advisory lock key as confirmHold so a walk-in create and
    // a concurrent hold confirmation on the same table cannot both pass and
    // double-book. bookSlot re-checks the reservation conflict under the lock.
    const result = await bookSlot({
      tableId: data.tableId,
      venueId: data.venueId,
      date: dateOnly,
      window: { startTime: now, endTime },
      partySize: data.partySize,
      write: async (tx) => {
        // Create the reservation AND flip the table to OCCUPIED in the SAME
        // transaction so the two writes commit or roll back together. If the
        // table update throws, the reservation insert is aborted with it — no
        // orphaned reservation row, no table left showing AVAILABLE.
        const createdReservation = await tx.reservation.create({
          data: {
            date: dateOnly,
            startTime: now,
            endTime,
            partySize: data.partySize,
            tableId: data.tableId,
            status: "CONFIRMED",
            guestName: data.guestName ?? "Walk-in",
            guestEmail: null,
            guestPhone: null,
            guestId: data.guestId ?? null,
            userId: userId ?? null,
            venueId: data.venueId ?? null,
            notes: null,
            occasion: data.occasion ?? null,
            seatingPreference: data.seatingPreference ?? null,
          },
          include: {
            table: true,
            guest: {
              select: { visitCount: true, communicationPreference: true, unsubscribed: true },
            },
          },
        });

        await recordReservationEvent(tx, {
          reservationId: createdReservation.id,
          venueId: createdReservation.venueId,
          kind: "created",
          actor,
          from: null,
          to: toEventState(createdReservation),
        });

        const seatedFrom = await tx.table.findUniqueOrThrow({
          where: { id: data.tableId },
          select: { status: true, venueId: true },
        });
        const occupiedTable = await tx.table.update({
          where: { id: data.tableId },
          data: { status: "OCCUPIED" },
        });
        await recordTableEvent(tx, {
          tableId: data.tableId,
          venueId: seatedFrom.venueId,
          fromStatus: seatedFrom.status,
          toStatus: "OCCUPIED",
          actor: actor.type === "staff" ? { type: "staff", id: actor.id } : SYSTEM_TABLE_ACTOR,
          reservationId: createdReservation.id,
        });

        return { reservation: createdReservation, table: occupiedTable };
      },
    });

    if (!result.ok) {
      return {
        success: false,
        error: "Table is not available",
      };
    }

    return {
      success: true,
      reservation: toReservation(result.value.reservation),
      table: toTable(result.value.table),
    };
  },
};
