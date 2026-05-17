import { prisma } from "./database.js";

export async function findReservationsNeedingReminder() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  return prisma.reservation.findMany({
    where: {
      startTime: {
        gte: windowStart,
        lte: windowEnd,
      },
      status: { in: ["PENDING", "CONFIRMED"] },
      reminderSentAt: null,
      guestEmail: { not: null },
    },
    include: { venue: true },
  });
}
