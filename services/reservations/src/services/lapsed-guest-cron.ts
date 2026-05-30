import type { FastifyBaseLogger } from "fastify";
import { prisma } from "./database.js";
import { runLapsedGuestScan } from "./lapsed-guest-scan.js";

const DAILY_MS = 24 * 60 * 60 * 1000;

/**
 * Schedule a daily lapsed-guest scan across all venues.
 * Runs once immediately at startup (after a short delay), then every 24h.
 */
export function scheduleLapsedGuestCron(log: FastifyBaseLogger): void {
  const scan = async () => {
    try {
      const venues = await prisma.venue.findMany({ select: { id: true } });
      for (const venue of venues) {
        const lapsing = await runLapsedGuestScan(venue.id);
        if (lapsing.length > 0) {
          log.info(
            { venueId: venue.id, count: lapsing.length },
            "lapsed guest scan: found lapsing guests"
          );
        }
      }
    } catch (err) {
      log.error({ err }, "lapsed guest scan: error");
    }
  };

  // Run first scan after 1 minute (let service fully start), then daily
  setTimeout(() => {
    void scan();
    setInterval(() => void scan(), DAILY_MS);
  }, 60_000);
}
