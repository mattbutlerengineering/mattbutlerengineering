import { prisma } from "./database.js";

/**
 * Counts-only booking-funnel telemetry (issue #3665, part 1/5 of the
 * booking-funnel telemetry feature). Deliberately returns aggregate counts
 * ONLY — never a reservation id, guest name, email, or phone. No PII may be
 * added to this shape; downstream sensor collectors (parts 2-5) depend on
 * that guarantee.
 */

export interface ReservationStatusCounts {
  pending: number;
  confirmed: number;
  cancelled: number;
  completed: number;
  noShow: number;
}

export interface DepositTransitionCounts {
  held: number;
  applied: number;
  refunded: number;
  forfeited: number;
}

export interface DailyBookingMetrics {
  date: string;
  venueId: string;
  reservations: ReservationStatusCounts;
  deposits: DepositTransitionCounts;
}

export interface GetDailyBookingMetricsParams {
  /** YYYY-MM-DD */
  date: string;
  venueId: string;
}

const RESERVATION_STATUS_KEYS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  NO_SHOW: "noShow",
} as const;

async function getDailyBookingMetrics(
  params: GetDailyBookingMetricsParams
): Promise<DailyBookingMetrics> {
  const { date, venueId } = params;
  // `Reservation.date` is a @db.Date column (no time component), so exact
  // equality on UTC midnight scopes to the whole day. Deposit transition
  // columns are full DateTime, so those need a [dayStart, dayEnd) range.
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [reservationGroups, held, applied, refunded, forfeited] = await Promise.all([
    prisma.reservation.groupBy({
      by: ["status"],
      where: { venueId, date: dayStart },
      _count: true,
    }),
    prisma.deposit.count({
      where: { reservation: { venueId }, heldAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.deposit.count({
      where: { reservation: { venueId }, appliedAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.deposit.count({
      where: { reservation: { venueId }, refundedAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.deposit.count({
      where: { reservation: { venueId }, forfeitedAt: { gte: dayStart, lt: dayEnd } },
    }),
  ]);

  const reservations: ReservationStatusCounts = {
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    completed: 0,
    noShow: 0,
  };
  for (const group of reservationGroups) {
    const key = RESERVATION_STATUS_KEYS[group.status];
    reservations[key] = group._count;
  }

  return {
    date,
    venueId,
    reservations,
    deposits: { held, applied, refunded, forfeited },
  };
}

export const bookingMetricsService = { getDailyBookingMetrics };
