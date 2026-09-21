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
 * OPEN PREREQUISITE — deliberately left unscoped, and deliberately NOT given
 * an escape hatch. Unlike `findGuestsForVenue`, this read cannot be
 * venue-scoped by construction: `venues`' RLS policy is keyed on each row's
 * OWN id (`20260919000000_enable_rls_venues`), and this query's entire
 * purpose is to discover those ids, so there is no single `app.venue_id`
 * value that would make it correct. It is a genuine cross-venue read.
 *
 * It works today only because Postgres skips RLS for a table's OWNER and
 * this service connects as the role that ran its migrations, which owns
 * `venues` — `FORCE ROW LEVEL SECURITY` is not set on any table (see
 * `../../CLAUDE.md` § RLS, and `../routes/rls-isolation.integration.test.ts`).
 * It will start returning zero rows — turning the whole cron into a silent
 * no-op — the moment either `FORCE ROW LEVEL SECURITY` lands or the service
 * stops connecting as the owner (#5369). Neither has happened, so nothing
 * here is broken in production today.
 *
 * Resolving that is out of scope for issue #5401 and is tracked as an open
 * prerequisite in ADR-026 §3: the `BYPASSRLS` role that ADR originally
 * sketched is not available on this deployment (DigitalOcean Managed
 * Postgres grants no true superuser, and Postgres permits `BYPASSRLS` to be
 * set only by a superuser or another `BYPASSRLS` role — `CREATEROLE` is
 * explicitly not sufficient), so it needs a different mechanism, decided
 * alongside whichever change removes owner-bypass.
 *
 * Exported for the same reason `findGuestsForVenue` is: so
 * `lapsed-guest-cron.rls.integration.test.ts` can pin this behavior against
 * a real Postgres instance.
 */
export async function getAllVenueIds(prisma: PrismaClient): Promise<string[]> {
  const venues = await prisma.venue.findMany({ select: { id: true } });
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
