import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyChanges, collapseDayNamedSchedules, validateConfig } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import type { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { db } from "../services/database.js";
import { diffConfig, type ConfigDiff } from "../services/availability-config-plan.js";
import { readStoredConfig, writeConfigDiff } from "../services/availability-config-rows.js";
import { getAllVenueIds } from "../services/lapsed-guest-cron.js";

/**
 * Folds migrated day-named schedules ("Thu–Fri hours") into the regular week, for venues that were
 * backfilled before the migration emitted one regular week (ADR-031). Run by an operator, once per
 * environment that holds such venues:
 *
 *   node --conditions production dist/scripts/collapse-day-named-schedules.js            # dry run: reports only
 *   node --conditions production dist/scripts/collapse-day-named-schedules.js --apply    # writes
 *   pnpm db:collapse-day-named-schedules [--apply]                                       # same, via tsx (dev)
 *
 * Which schedules fold, and into what, is `collapseDayNamedSchedules`; this script only applies its
 * result. Per venue, in one transaction in the venue's own RLS context: compare-and-set
 * `Venue.availabilityVersion` (+1, so an open draft or an old Undo gets a 409 instead of
 * overwriting), replace the regular schedule's rows with the encoded week, delete the folded
 * schedules' assignments and archive the schedules. No `AvailabilityChange` row is written, as for
 * Backfill, so the "carried over" banner stays for venues nobody has saved. Every outcome line
 * carries the rows it replaced, so the log doubles as a backup (the archived schedules can be
 * unarchived). A venue whose compare-and-set misses (a Manager saved meanwhile) is `raced` and
 * skipped. Safe to re-run: a collapsed venue has nothing left to collapse. One venue failing does
 * not stop the rest. Exit code is 1 only if a venue errored.
 */

const COLLAPSE_ACTOR = "system:collapse-day-named-schedules";

/** The stored rows an apply updates or deletes: the pre-image the log keeps. */
export interface ReplacedRows {
  schedules: unknown[];
  scheduleServices: unknown[];
  assignments: unknown[];
}

export type CollapseOutcome =
  | { venueId: string; outcome: "would_collapse" | "collapsed"; replaced: ReplacedRows }
  | { venueId: string; outcome: "nothing_to_collapse" | "raced" | "not_found" }
  | { venueId: string; outcome: "refused"; issues: string[] };

export interface CollapseSummary {
  apply: boolean;
  venues: number;
  counts: Record<string, number>;
  errors: { venueId: string; message: string }[];
}

type Log = (line: string) => void;

/** The stored rows the diff touches, as they were. */
function replacedBy(config: AvailabilityConfig, diff: ConfigDiff): ReplacedRows {
  const pick = <T extends keyof ReplacedRows>(table: T) => {
    const touched = new Set([
      ...(diff.update[table] as { id: string }[]).map((r) => r.id),
      ...diff.remove[table],
    ]);
    return (config[table] as { id: string }[]).filter((r) => touched.has(r.id));
  };
  return {
    schedules: pick("schedules"),
    scheduleServices: pick("scheduleServices"),
    assignments: pick("assignments"),
  };
}

export async function collapseVenue(
  prisma: PrismaClient,
  venueId: string,
  options: { apply: boolean; now?: Date }
): Promise<CollapseOutcome> {
  const now = options.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    const venue = await tx.venue.findUnique({
      where: { id: venueId },
      select: { availabilityVersion: true },
    });
    if (!venue) return { venueId, outcome: "not_found" as const };

    // The version is read before the rows: a save landing in between moves it, so the
    // compare-and-set below misses instead of writing over a config this plan never saw.
    const { config } = await readStoredConfig(tx, venueId);
    const changes = collapseDayNamedSchedules(config, randomUUID);
    if (!changes) return { venueId, outcome: "nothing_to_collapse" as const };

    const next = applyChanges(config, changes, now.toISOString());
    const issues = validateConfig(next);
    if (issues.length > validateConfig(config).length) {
      return {
        venueId,
        outcome: "refused" as const,
        issues: issues.map((i) => `${i.code}: ${i.message}`),
      };
    }
    const diff = diffConfig(config, next);
    const replaced = replacedBy(config, diff);
    if (!options.apply) return { venueId, outcome: "would_collapse" as const, replaced };

    const cas = await tx.venue.updateMany({
      where: { id: venueId, availabilityVersion: venue.availabilityVersion },
      data: { availabilityVersion: { increment: 1 } },
    });
    if (cas.count === 0) return { venueId, outcome: "raced" as const };

    await writeConfigDiff(tx, venueId, diff, { actorId: COLLAPSE_ACTOR, now });
    return { venueId, outcome: "collapsed" as const, replaced };
  });
}

export async function runCollapse(
  prisma: PrismaClient,
  options: { apply: boolean },
  log: Log
): Promise<CollapseSummary> {
  const venueIds = await getAllVenueIds(prisma);
  const counts: Record<string, number> = {};
  const errors: CollapseSummary["errors"] = [];

  for (const venueId of venueIds) {
    try {
      const outcome = await collapseVenue(prisma, venueId, options);
      counts[outcome.outcome] = (counts[outcome.outcome] ?? 0) + 1;
      log(JSON.stringify(outcome));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ venueId, message });
      log(JSON.stringify({ venueId, outcome: "error", message }));
    }
  }
  return { apply: options.apply, venues: venueIds.length, counts, errors };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const prisma = db.prisma as unknown as PrismaClient;
  try {
    const summary = await runCollapse(prisma, { apply }, (line) =>
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
