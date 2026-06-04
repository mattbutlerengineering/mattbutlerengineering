import type { FastifyBaseLogger } from "fastify";
import type { LapsingGuest } from "@mbe/types";

const DEFAULT_STARTUP_DELAY_MS = 60_000;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface LapsedGuestMonitorConfig {
  getVenueIds: () => Promise<string[]>;
  runScan: (venueId: string) => Promise<LapsingGuest[]>;
  startupDelayMs?: number;
  intervalMs?: number;
}

export interface LapsedGuestMonitor {
  start(log: FastifyBaseLogger): void;
  stop(): void;
}

export function createLapsedGuestMonitor(config: LapsedGuestMonitorConfig): LapsedGuestMonitor {
  const {
    getVenueIds,
    runScan,
    startupDelayMs = DEFAULT_STARTUP_DELAY_MS,
    intervalMs = DEFAULT_INTERVAL_MS,
  } = config;

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
