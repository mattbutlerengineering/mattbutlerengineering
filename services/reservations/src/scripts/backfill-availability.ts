import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../generated/prisma/index.js";
import { db } from "../services/database.js";
import { getAllVenueIds } from "../services/lapsed-guest-cron.js";
import { migrateVenue, type VenueMigrationOutcome } from "../services/availability-migration.js";

/**
 * Backfills availability rows from each venue's legacy `operatingHours`
 * (issue #7502). Run by an operator, once per environment, after the
 * `add_venue_availability` migration is applied:
 *
 *   node --conditions production dist/scripts/backfill-availability.js            # dry run: reports only
 *   node --conditions production dist/scripts/backfill-availability.js --apply    # writes
 *   pnpm db:backfill-availability [--apply]                                       # same, via tsx (dev)
 *
 * Never touches `Venue.operatingHours`; every outcome line carries its original
 * value, so the log doubles as a backup. Safe to re-run: a venue that already has a regular schedule is skipped. Each
 * venue is its own transaction in its own RLS context; one venue failing does
 * not stop the rest. Venues with an unrecognised shape are left untouched and
 * listed (id + reason) in the summary's `unrecognised`. Exit code is 1 only if
 * a venue errored.
 */

export interface BackfillSummary {
  apply: boolean;
  venues: number;
  counts: Record<string, number>;
  errors: { venueId: string; message: string }[];
  unrecognised: { venueId: string; reason: string }[];
}

type Log = (line: string) => void;

export async function runBackfill(
  prisma: PrismaClient,
  options: { apply: boolean },
  log: Log
): Promise<BackfillSummary> {
  const venueIds = await getAllVenueIds(prisma);
  const counts: Record<string, number> = {};
  const errors: BackfillSummary["errors"] = [];
  const unrecognised: BackfillSummary["unrecognised"] = [];

  for (const venueId of venueIds) {
    try {
      const outcome: VenueMigrationOutcome = await migrateVenue(prisma, venueId, options);
      counts[outcome.outcome] = (counts[outcome.outcome] ?? 0) + 1;
      if (outcome.outcome === "unrecognised") {
        unrecognised.push({ venueId, reason: outcome.reason });
      }
      log(JSON.stringify(outcome));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ venueId, message });
      log(JSON.stringify({ venueId, outcome: "error", message }));
    }
  }
  return { apply: options.apply, venues: venueIds.length, counts, errors, unrecognised };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const prisma = db.prisma as unknown as PrismaClient;
  try {
    const summary = await runBackfill(prisma, { apply }, (line) =>
      process.stdout.write(`${line}\n`)
    );
    process.stdout.write(`${JSON.stringify({ summary })}\n`);
    process.exitCode = summary.errors.length > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

// Compare real paths: import.meta.url is already resolved, argv[1] may be a symlink.
const entry = process.argv[1];
if (entry && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry)) {
  void main();
}
