import type { FastifyBaseLogger } from "fastify";
import type { LapsingGuest } from "@mbe/types";
import type { PrismaClient } from "../generated/prisma/index.js";
import type { LapsedGuestScanDeps } from "./lapsed-guest-scan.js";
import { runLapsedGuestScan } from "./lapsed-guest-scan.js";
import { emitLapsingGuests } from "./events.js";
import { setVenueContext } from "../middleware/venue-context.js";

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
 * This runs with no HTTP request context, so `getCurrentVenueId()` always
 * resolves `null` and the per-call auto-wrap in `./venue-scoped-prisma.ts`
 * has no venue id to set (issue #5401). `guests` — and, via the nested
 * `reservations` select, `reservations` — are RLS-protected, so an unscoped
 * read here is default-deny (ADR-026 §4): zero rows, silently, rather than
 * an error.
 *
 * The cron already knows which venue it is scanning, so there is nothing to
 * escape: this opens its own explicit transaction and sets `app.venue_id` to
 * that venue as the transaction's FIRST statement, then runs the guest query
 * against the same `tx`. This is the identical pattern the request-path call
 * sites that manage their own transaction boundary already use
 * (`book-slot.ts`, `waitlist.ts`, `floor-plan.ts`, `reservation.ts`) — see
 * `../middleware/venue-context.ts` for why the `set_config(..., true)` and
 * the query it scopes must share one transaction.
 *
 * Correct under today's semantics AND under `FORCE ROW LEVEL SECURITY`: it
 * never depends on the connecting role owning the table (the reason the
 * bug in #5401 is latent rather than live today — see `getAllVenueIds`).
 *
 * Exported (not just used inline in `buildPrismaCallbacks` below) so it can
 * be exercised directly against a real Postgres instance in
 * `lapsed-guest-cron.rls.integration.test.ts`, which is the only way to
 * prove this actually reads each venue's rows under RLS rather than merely
 * not throwing.
 */
export function findGuestsForVenue(
  prisma: PrismaClient,
  venueId: string
): ReturnType<LapsedGuestScanDeps["findGuestsForScan"]> {
  return prisma.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    return tx.guest.findMany({
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
    });
  });
}

/**
 * Reads every venue id, for the per-venue cron loop below.
 *
 * A genuine cross-venue read: unlike `findGuestsForVenue`, it cannot be
 * venue-scoped by construction, because `venues`' RLS policy is keyed on each
 * row's OWN id (`20260919000000_enable_rls_venues`) and this query's entire
 * purpose is to discover those ids — no single `app.venue_id` makes it
 * correct. It therefore goes through ADR-026 §3's one escape hatch,
 * `app_cross_venue_venues()`
 * (`20260920000000_add_cross_venue_read_escape_hatch`): a `SECURITY DEFINER`
 * function admitted by a `SELECT`-only policy keyed on the transaction-local
 * marker the function sets and restores around its own `venues` scan.
 *
 * This replaced a bare `prisma.venue.findMany` that worked only because
 * Postgres skips RLS for a table's OWNER and this service connects as the
 * role that ran its migrations (#5369) — it returned zero rows, silently
 * turning the whole cron into a no-op, as soon as either
 * `FORCE ROW LEVEL SECURITY` landed or the service stopped connecting as the
 * owner. Through the hatch it is correct in all four combinations, proven
 * against real Postgres as a non-owner role under FORCE in
 * `../routes/rls-isolation.integration.test.ts`.
 *
 * `$queryRaw` (not a model delegate) is deliberate twice over: Prisma cannot
 * call a set-returning function through a delegate, and `$`-prefixed methods
 * pass through `./venue-scoped-prisma.ts`'s wrapper unwrapped, so this runs as
 * its own single statement with no surrounding transaction — which is exactly
 * the marker's lifetime. The venue-group filter is left `NULL` here: the cron
 * scans every venue.
 *
 * Exported for the same reason `findGuestsForVenue` is: so the integration
 * suites can pin this behavior against a real Postgres instance.
 */
export async function getAllVenueIds(prisma: PrismaClient): Promise<string[]> {
  const venues = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM app_cross_venue_venues()`;
  return venues.map((venue) => venue.id);
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
