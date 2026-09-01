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
import type { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { availabilityService } from "./availability.js";
import { assertBookable } from "./assert-bookable.js";
import { mapPrismaTable } from "./table.js";
import { bookSlot } from "./book-slot.js";
import { toReservation } from "./serializers.js";
import { transitionReservation, ReservationTransitionError } from "./reservation-state-machine.js";
import { guestService } from "./guest.js";

export { ReservationTransitionError };

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
}

export interface UpdateReservationResult {
  success: boolean;
  reservation?: Reservation;
  error?: string;
  conflict?: ConflictCheckResult;
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
          guest: {
            select: { visitCount: true, communicationPreference: true, unsubscribed: true },
          },
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
        guest: { select: { visitCount: true, communicationPreference: true, unsubscribed: true } },
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
        guest: { select: { visitCount: true, communicationPreference: true, unsubscribed: true } },
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

    // Resolve the venue used for the pacing pre-check and the pacing/conflict
    // re-check under the lock. Prefer the request's venueId, else the table's.
    const venueId =
      data.venueId ??
      (await prisma.table.findUnique({ where: { id: data.tableId }, select: { venueId: true } }))
        ?.venueId ??
      null;

    if (venueId) {
      // Fetch venue settings + conflict slices once, then evaluate the single
      // canonical booking invariant (conflict + pacing) through assertBookable —
      // the same seam confirmHold and createWalkIn cross, so staff direct
      // bookings can never apply a different rule than guest bookings.
      const venue = await prisma.venue.findUnique({ where: { id: venueId } });
      const settings = (venue?.settings ?? null) as VenueSettings | null;
      const { reservations, holds } = await availabilityService.fetchConflictData(
        venueId,
        data.date
      );

      const bookingError = assertBookable({
        tableId: data.tableId,
        window: { startTime, endTime },
        partySize: data.partySize,
        settings,
        reservations,
        holds,
      });

      if (bookingError?.code === "CONFLICT") {
        return {
          success: false,
          error: "Time slot has a conflict with an existing reservation or hold",
          conflict: { hasConflict: true },
        };
      }
      if (bookingError?.code === "PACING_EXCEEDED") {
        const maxCovers = settings?.pacingRules?.[0]?.maxCoversPerSlot ?? Infinity;
        return {
          success: false,
          error: bookingError.message,
          pacing: { withinLimit: false, currentCovers: 0, maxCovers },
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
      write: (tx) =>
        tx.reservation.create({
          data: {
            date: new Date(data.date),
            startTime,
            endTime,
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
            guest: {
              select: { visitCount: true, communicationPreference: true, unsubscribed: true },
            },
          },
        }),
    });

    if (!result.ok) {
      return {
        success: false,
        error: "Time slot has a conflict with an existing reservation or hold",
        conflict: { hasConflict: true },
      };
    }

    return { success: true, reservation: toReservation(result.value) };
  },

  async update(id: string, data: UpdateReservationRequest): Promise<Reservation | null> {
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
          select: { status: true, guestId: true, startTime: true },
        });
        if (!existing) return null;
        // Throws ReservationTransitionError on invalid transition.
        transitionReservation(existing.status, data.status);

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

          return client.reservation.findUnique({
            where: { id },
            include: { table: true },
          });
        };

        const updated =
          data.status === "NO_SHOW" && existing.guestId
            ? await prisma.$transaction((tx) => writeStatusChange(tx))
            : await writeStatusChange(prisma);

        return updated ? toReservation(updated) : null;
      }

      const reservation = await prisma.reservation.update({
        where: { id },
        data: updateData,
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

    // Notes / party-size / preference edits are not slot moves — no lock needed.
    if (!timeOrTableChanged) {
      const reservation = await this.update(id, data);
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
      // canonical booking invariant (conflict + pacing) through assertBookable —
      // the same seam every other write path crosses. Exclude the current
      // reservation from the slices so a move doesn't conflict or pace against
      // itself. This closes the pacing gap: moves previously checked conflict
      // only, so a slot move could push a window over its cover limit.
      const venue = await prisma.venue.findUnique({ where: { id: venueId } });
      const settings = (venue?.settings ?? null) as VenueSettings | null;
      const { reservations, holds } = await availabilityService.fetchConflictData(venueId, date);
      const filteredReservations = reservations.filter((r) => r.id !== id);

      const bookingError = assertBookable({
        tableId,
        window: { startTime, endTime },
        partySize: data.partySize ?? existing.partySize,
        settings,
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
      if (bookingError?.code === "PACING_EXCEEDED") {
        return {
          success: false,
          error: bookingError.message,
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
    };

    const result = await bookSlot({
      tableId,
      venueId,
      date: new Date(date),
      window: { startTime, endTime },
      partySize: data.partySize ?? existing.partySize,
      excludeReservationId: id,
      checkHoldConflict: true,
      write: async (tx) => {
        try {
          return await tx.reservation.update({
            where: { id },
            data: updateData,
            include: { table: true },
          });
        } catch (err: unknown) {
          if (isPrismaNotFound(err)) return null;
          throw err;
        }
      },
    });

    if (!result.ok) {
      return {
        success: false,
        error: "Time slot has a conflict with an existing reservation or hold",
        conflict: { hasConflict: true },
      };
    }

    if (!result.value) {
      return { success: false, error: "Failed to update reservation" };
    }

    return { success: true, reservation: toReservation(result.value) };
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
      table: mapPrismaTable(result.value.table),
    };
  },
};
