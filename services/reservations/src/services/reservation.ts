import {
  toDateString,
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
import { prisma } from "./database.js";
import { availabilityService } from "./availability.js";
import { assertBookable } from "./assert-bookable.js";
import { mapPrismaTable } from "./table.js";
import { tableAdvisoryLockSql } from "./confirm-hold.js";
import { toReservation } from "./serializers.js";
import { transitionReservation, ReservationTransitionError } from "./reservation-state-machine.js";

export { ReservationTransitionError };

export interface ListReservationsOptions {
  page: number;
  limit: number;
  date?: string;
  status?: ReservationStatus;
  tableId?: string;
  venueId?: string;
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
}

export interface UpdateReservationResult {
  success: boolean;
  reservation?: Reservation;
  error?: string;
  conflict?: ConflictCheckResult;
}

export const reservationService = {
  async list(options: ListReservationsOptions): Promise<PaginatedResponse<Reservation>> {
    const { page, limit, date, status, tableId, venueId } = options;

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

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        ...paginate({ page, limit }),
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        include: {
          table: true,
          guest: { select: { visitCount: true, communicationPreference: true } },
        },
      }),
      prisma.reservation.count({ where }),
    ]);

    return {
      data: reservations.map(toReservation),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  async listByUserId(
    userId: string,
    page: number,
    limit: number
  ): Promise<PaginatedResponse<Reservation>> {
    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where: { userId },
        ...paginate({ page, limit }),
        orderBy: [{ date: "desc" }, { startTime: "desc" }],
        include: {
          table: true,
          guest: { select: { visitCount: true, communicationPreference: true } },
        },
      }),
      prisma.reservation.count({ where: { userId } }),
    ]);

    return {
      data: reservations.map(toReservation),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  async getById(id: string): Promise<Reservation | null> {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        table: true,
        guest: { select: { visitCount: true, communicationPreference: true } },
      },
    });
    return reservation ? toReservation(reservation) : null;
  },

  async create(data: CreateReservationRequest, userId?: string): Promise<Reservation> {
    const reservation = await prisma.reservation.create({
      data: {
        date: new Date(data.date),
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        partySize: data.partySize,
        tableId: data.tableId,
        notes: data.notes ?? null,
        guestName: data.guestName ?? null,
        guestEmail: data.guestEmail ?? null,
        guestPhone: data.guestPhone ?? null,
        guestId: data.guestId ?? null,
        userId: userId ?? null,
        venueId: data.venueId ?? null,
      },
      include: {
        table: true,
        guest: { select: { visitCount: true, communicationPreference: true } },
      },
    });
    return toReservation(reservation);
  },

  /**
   * Creates a reservation with conflict and pacing checks.
   * Used for staff direct booking (bypassing hold flow).
   */
  async createWithConflictCheck(
    data: CreateReservationRequest,
    userId?: string
  ): Promise<CreateReservationResult> {
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);

    if (data.venueId) {
      // Fetch reservations + holds once, then evaluate conflict + pacing rules.
      const { reservations, holds } = await availabilityService.fetchConflictData(
        data.venueId,
        data.date
      );

      const hasConflict = availabilityService.checkTableConflict(
        data.tableId,
        startTime,
        endTime,
        reservations,
        holds
      );

      if (hasConflict) {
        return {
          success: false,
          error: "Time slot has a conflict with an existing reservation or hold",
          conflict: { hasConflict: true },
        };
      }

      const venue = await prisma.venue.findUnique({
        where: { id: data.venueId },
      });

      if (venue) {
        const settings = venue.settings as VenueSettings | null;
        const pacingOk = availabilityService.checkPacingForSlot(
          startTime,
          data.partySize,
          settings,
          reservations,
          holds
        );

        if (!pacingOk) {
          const maxCovers = settings?.pacingRules?.[0]?.maxCoversPerSlot ?? Infinity;
          return {
            success: false,
            error: `Pacing limit exceeded. Maximum ${maxCovers} covers allowed per time window.`,
            pacing: { withinLimit: false, currentCovers: 0, maxCovers },
          };
        }
      }
    } else {
      // No venue in request — look up the table's venueId so we can use the
      // same fetch-once + pure-rule path as the venueId branch above.
      const table = await prisma.table.findUnique({
        where: { id: data.tableId },
        select: { venueId: true },
      });
      const tableVenueId = table?.venueId;
      if (tableVenueId) {
        const { reservations, holds } = await availabilityService.fetchConflictData(
          tableVenueId,
          data.date
        );
        const hasConflict = availabilityService.checkTableConflict(
          data.tableId,
          startTime,
          endTime,
          reservations,
          holds
        );
        if (hasConflict) {
          return {
            success: false,
            error: "Time slot has a conflict with an existing reservation or hold",
            conflict: { hasConflict: true },
          };
        }
      }
    }

    // Create the reservation
    const reservation = await this.create(data, userId);
    return { success: true, reservation };
  },

  async update(id: string, data: UpdateReservationRequest): Promise<Reservation | null> {
    try {
      // Guard status transitions through the state machine before writing.
      if (data.status !== undefined) {
        const existing = await prisma.reservation.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!existing) return null;
        // Throws ReservationTransitionError on invalid transition.
        transitionReservation(existing.status as ReservationStatus, data.status);
      }

      const reservation = await prisma.reservation.update({
        where: { id },
        data: {
          ...(data.date !== undefined && { date: new Date(data.date) }),
          ...(data.startTime !== undefined && {
            startTime: new Date(data.startTime),
          }),
          ...(data.endTime !== undefined && { endTime: new Date(data.endTime) }),
          ...(data.partySize !== undefined && { partySize: data.partySize }),
          ...(data.tableId !== undefined && { tableId: data.tableId }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        include: { table: true },
      });
      return toReservation(reservation);
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
    data: UpdateReservationRequest
  ): Promise<UpdateReservationResult> {
    // Get the existing reservation
    const existing = await prisma.reservation.findUnique({
      where: { id },
    });

    if (!existing) {
      return { success: false, error: "Reservation not found" };
    }

    // Determine if we need to check for conflicts
    const timeOrTableChanged =
      data.date !== undefined ||
      data.startTime !== undefined ||
      data.endTime !== undefined ||
      data.tableId !== undefined;

    if (timeOrTableChanged) {
      // Build the final values for conflict check
      const date = data.date ?? toDateString(existing.date);
      const startTime = data.startTime ? new Date(data.startTime) : existing.startTime;
      const endTime = data.endTime ? new Date(data.endTime) : existing.endTime;
      const tableId = data.tableId ?? existing.tableId;

      // Resolve venueId — prefer the reservation's own venueId, fall back to
      // the table's venueId if the reservation was created without one.
      const venueId =
        existing.venueId ??
        (await prisma.table.findUnique({ where: { id: tableId }, select: { venueId: true } }))
          ?.venueId;

      if (venueId) {
        // Fetch conflict data once, then apply the pure rule.
        // Exclude the current reservation from the slices so it doesn't
        // conflict with itself (TOCTOU-safe: reservation row is still present
        // in DB at this point, so we filter it client-side).
        const { reservations, holds } = await availabilityService.fetchConflictData(venueId, date);
        const filteredReservations = reservations.filter((r) => r.id !== id);

        const hasConflict = availabilityService.checkTableConflict(
          tableId,
          startTime,
          endTime,
          filteredReservations,
          holds
        );

        if (hasConflict) {
          return {
            success: false,
            error: "Time slot has a conflict with an existing reservation or hold",
            conflict: { hasConflict: true },
          };
        }
      }
    }

    // Perform the update
    const reservation = await this.update(id, data);
    if (!reservation) {
      return { success: false, error: "Failed to update reservation" };
    }

    return { success: true, reservation };
  },

  async createWalkIn(data: WalkInRequest, userId?: string): Promise<CreateReservationResult> {
    const now = new Date();
    const durationMinutes = data.durationMinutes ?? 90;
    const endTime = new Date(now.getTime() + durationMinutes * 60 * 1000);

    // Date only (no time component), normalized to midnight UTC
    const dateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const dateStr = toDateString(dateOnly);

    // Pre-check for conflicts and pacing before the transaction (which re-checks
    // to prevent TOCTOU races). Fetch the conflict slices once and use the
    // canonical assertBookable predicate (conflict + pacing in one call).
    const venue = await prisma.venue.findUnique({ where: { id: data.venueId } });
    const settings = (venue?.settings ?? null) as VenueSettings | null;
    const { reservations, holds } = await availabilityService.fetchConflictData(
      data.venueId,
      dateStr
    );

    const bookingError = assertBookable({
      tableId: data.tableId,
      window: { startTime: now, endTime },
      partySize: data.partySize,
      settings,
      reservations,
      holds,
    });

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

    const result = await prisma.$transaction(async (tx) => {
      // Serialize conflict-checked writes per table BEFORE the conflict check so
      // a walk-in create and a concurrent hold confirmation on the same table
      // cannot both pass and double-book. Shares the same lock key as
      // confirmHold. Released automatically when the transaction ends.
      await tx.$executeRaw(tableAdvisoryLockSql(data.tableId));

      // Re-check for conflicting reservations inside the transaction
      const conflicting = await tx.reservation.findFirst({
        where: {
          tableId: data.tableId,
          date: dateOnly,
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
          AND: [{ startTime: { lt: endTime } }, { endTime: { gt: now } }],
        },
        select: { id: true },
      });

      if (conflicting) {
        return null;
      }

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
          guestId: null,
          userId: userId ?? null,
          venueId: data.venueId ?? null,
          notes: null,
        },
        include: { table: true },
      });

      const occupiedTable = await tx.table.update({
        where: { id: data.tableId },
        data: { status: "OCCUPIED" },
      });

      return { reservation: createdReservation, table: occupiedTable };
    });

    if (!result) {
      return {
        success: false,
        error: "Table is not available",
      };
    }

    return {
      success: true,
      reservation: toReservation(result.reservation),
      table: mapPrismaTable(result.table),
    };
  },

  async cancel(id: string, reason?: string, note?: string): Promise<Reservation | null> {
    try {
      const existing = await prisma.reservation.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!existing) return null;
      // Throws ReservationTransitionError if current status cannot be cancelled.
      transitionReservation(existing.status as ReservationStatus, "CANCELLED");

      const reservation = await prisma.reservation.update({
        where: { id },
        data: {
          status: "CANCELLED",
          ...(reason !== undefined && { cancellationReason: reason }),
          ...(note !== undefined && { cancellationNote: note }),
        },
        include: {
          table: true,
          guest: { select: { visitCount: true, communicationPreference: true } },
        },
      });
      return toReservation(reservation);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },
};
