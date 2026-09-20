import type { FastifyBaseLogger } from "fastify";
import type { LapsingGuest } from "@mbe/types";
import type { PrismaClient } from "../generated/prisma/index.js";
import type { LapsedGuestScanDeps } from "./lapsed-guest-scan.js";
import { runLapsedGuestScan } from "./lapsed-guest-scan.js";
import { emitLapsingGuests } from "./events.js";
import { withRlsBypass } from "./rls-bypass.js";

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
  LapsedGuestMonitorPrismaConfig | LapsedGuestMonitorCallbackConfig;

export interface LapsedGuestMonitor {
  start(log: FastifyBaseLogger): void;
  stop(): void;
}

function isPrismaConfig(
  config: LapsedGuestMonitorConfig
): config is LapsedGuestMonitorPrismaConfig {
  return "prisma" in config;
}

/**
 * Reads the guests eligible for lapse detection in a single venue.
 *
 * This is a cross-venue read path in aggregate (the cron loops it over
 * every venue with no HTTP request context, so `getCurrentVenueId()` always
 * resolves `null` -- ADR-026 §3's audited `lapsed-guest-cron.ts` escape
 * hatch). `guests` (and, via the nested `reservations` select, the
 * `reservations` table) are RLS-protected: without the `app_rls_bypass`
 * role, this query silently returns zero rows for every venue instead of
 * throwing (ADR-026 §4 default-deny) -- see `./rls-bypass.ts`.
 *
 * Exported (not just used inline in `buildPrismaCallbacks` below) so it can
 * be exercised directly against a real Postgres instance in
 * `lapsed-guest-cron.rls.integration.test.ts`, which is the only way to
 * prove this actually reads across venues under RLS rather than merely not
 * throwing.
 */
export function findGuestsForVenue(
  prisma: PrismaClient,
  venueId: string
): ReturnType<LapsedGuestScanDeps["findGuestsForScan"]> {
  return withRlsBypass(prisma, (tx) =>
    tx.guest.findMany({
      where: {
        venueId,
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
    })
  );
}

/**
 * Reads every venue id, for the per-venue cron loop below.
 *
 * Like `findGuestsForVenue`, this is a cross-venue read with no HTTP
 * request context, so `getCurrentVenueId()`/`app.venue_id` is never set.
 * `venues` gained its own RLS policy in the
 * `20260919000000_enable_rls_venues` migration (ADR-026 §5), so an
 * unwrapped `prisma.venue.findMany()` here is now just as exposed to the
 * "silently returns zero rows" failure mode (ADR-026 §4 default-deny) as
 * the guest read already was. Table ownership currently masks this in
 * production -- the app's DB role owns `venues` and bypasses RLS
 * unconditionally until #5369 changes that -- so this has no live
 * functional impact today, but the code's own invariant should not depend
 * on that. Wrapped in the same `withRlsBypass` escape hatch as
 * `findGuestsForVenue` to remove the landmine before it matters.
 *
 * Exported for the same reason `findGuestsForVenue` is: so it can be
 * exercised directly against a real Postgres instance in
 * `lapsed-guest-cron.rls.integration.test.ts`.
 */
export function getAllVenueIds(prisma: PrismaClient): Promise<string[]> {
  return withRlsBypass(prisma, (tx) =>
    tx.venue.findMany({ select: { id: true } }).then((vs) => vs.map((v) => v.id))
  );
}

function buildPrismaCallbacks(
  prisma: PrismaClient
): Pick<LapsedGuestMonitorCallbackConfig, "getVenueIds" | "runScan"> {
  return {
    getVenueIds: () => getAllVenueIds(prisma),
    runScan: (venueId) =>
      runLapsedGuestScan(venueId, {
        findGuestsForScan: (vid) => findGuestsForVenue(prisma, vid),
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
          const results = await Promise.allSettled(venueIds.map((venueId) => runScan(venueId)));
          results.forEach((result, i) => {
            const venueId = venueIds[i];
            if (result.status === "rejected") {
              log.error({ venueId, err: result.reason }, "lapsed guest scan: venue error");
            } else if (result.value.length > 0) {
              log.info(
                { venueId, count: result.value.length },
                "lapsed guest scan: found lapsing guests"
              );
            }
          });
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
