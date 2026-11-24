import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../generated/prisma/index.js";
import { db } from "../services/database.js";
import { DEMO_VENUE_SLUG, ensureDemoVenue } from "../services/demo-venue.js";

/**
 * Seeds the public demo venue (`demo-bistro`, #9334) into the connected database.
 * Idempotent: safe to run after every deploy. Run by an operator against production
 * once migrations are applied (the migrate image only carries the Prisma CLI, so the
 * seeder cannot run inside it):
 *
 *   node --conditions production dist/scripts/seed-demo-venue.js
 *   pnpm db:seed-demo-venue        # same, via tsx (dev)
 *
 * Failure is logged and reflected in the exit code (1); it never throws.
 */

export type SeedDemoVenueResult =
  { ok: true; slug: string; venueId: string } | { ok: false; slug: string; message: string };

export async function runSeedDemoVenue(
  prisma: PrismaClient,
  log: (line: string) => void
): Promise<SeedDemoVenueResult> {
  try {
    const { venueId } = await ensureDemoVenue(prisma);
    log(JSON.stringify({ outcome: "seeded", slug: DEMO_VENUE_SLUG, venueId }));
    return { ok: true, slug: DEMO_VENUE_SLUG, venueId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(JSON.stringify({ outcome: "error", slug: DEMO_VENUE_SLUG, message }));
    return { ok: false, slug: DEMO_VENUE_SLUG, message };
  }
}

async function main(): Promise<void> {
  const prisma = db.prisma as unknown as PrismaClient;
  try {
    const result = await runSeedDemoVenue(prisma, (line) => process.stdout.write(`${line}\n`));
    process.exitCode = result.ok ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Compare real paths: import.meta.url is already resolved, argv[1] may be a symlink.
const entry = process.argv[1];
if (entry && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry)) {
  void main();
}
