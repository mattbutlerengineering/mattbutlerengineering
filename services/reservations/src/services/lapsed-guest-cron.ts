import type { FastifyBaseLogger } from "fastify";
import type { LapsingGuest } from "@mbe/types";
import type { PrismaClient } from "../generated/prisma/index.js";
import { runLapsedGuestScan } from "./lapsed-guest-scan.js";
import { emitLapsingGuests } from "./events.js";

const DEFAULT_STARTUP_DELAY_MS = 60_000;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Minimum visit count for a guest to qualify for lapse detection. */
const LAPSE_MIN_VISIT_COUNT = 3;

/** Config using injected prisma client — qualification query lives here. */
export interface LapsedGuestMonitorPrismaConfig {
  prisma: PrismaClient;
  startupDelayMs?: number;
  intervalMs?: number;
}

/** Legacy config using explicit callback functions. */
export interface LapsedGuestMonitorCallbackConfig {
  getVenueIds: () => Promise<string[]>;
  runScan: (venueId: string) => Promise<LapsingGuest[]>;
  startupDelayMs?: number;
  intervalMs?: number;
}

export type LapsedGuestMonitorConfig =
  | LapsedGuestMonitorPrismaConfig
  | LapsedGuestMonitorCallbackConfig;

export interface LapsedGuestMonitor {
  start(log: FastifyBaseLogger): void;
  stop(): void;
}

function isPrismaConfig(
  config: LapsedGuestMonitorConfig
): config is LapsedGuestMonitorPrismaConfig {
  return "prisma" in config;
}

function buildPrismaCallbacks(
  prisma: PrismaClient
): Pick<LapsedGuestMonitorCallbackConfig, "getVenueIds" | "runScan"> {
  return {
    getVenueIds: () =>
      prisma.venue.findMany({ select: { id: true } }).then((vs) => vs.map((v) => v.id)),
    runScan: (venueId) =>
      runLapsedGuestScan(venueId, {
        findGuestsForScan: (vid) =>
          prisma.guest.findMany({
            where: {
              venueId: vid,
              visitCount: { gte: LAPSE_MIN_VISIT_COUNT },
              lastVisit: { not: null },
            },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              communicationPreference: true,
              reservations: {
                where: { status: "COMPLETED" },
                select: { startTime: true },
                orderBy: { startTime: "asc" },
              },
            },
          }),
        emitLapsingGuests,
      }),
  };
}

export function createLapsedGuestMonitor(config: LapsedGuestMonitorConfig): LapsedGuestMonitor {
  const { startupDelayMs = DEFAULT_STARTUP_DELAY_MS, intervalMs = DEFAULT_INTERVAL_MS } = config;

  const { getVenueIds, runScan } = isPrismaConfig(config)
    ? buildPrismaCallbacks(config.prisma)
    : config;

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  return {
    start(log: FastifyBaseLogger): void {
      const scan = async () => {
        try {
          const venueIds = await getVenueIds();
          for (const venueId of venueIds) {
            const lapsing = await runScan(venueId);
            if (lapsing.length > 0) {
              log.info(
                { venueId, count: lapsing.length },
                "lapsed guest scan: found lapsing guests"
              );
            }
          }
        } catch (err) {
          log.error({ err }, "lapsed guest scan: error");
        }
      };

      timeoutHandle = setTimeout(() => {
        void scan();
        intervalHandle = setInterval(() => void scan(), intervalMs);
      }, startupDelayMs);
    },

    stop(): void {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (intervalHandle !== null) {
        clearInterval(intervalHandle);
        intervalHandle = null;
      }
    },
  };
}
