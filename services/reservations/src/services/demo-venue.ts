import type { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { planVenueMigration, writeAvailabilityConfig } from "./availability-migration.js";
import { SEED_VENUES } from "../test/seed-venues.js";

/** Canonical public demo venue: `GET /api/v1/venues/by-slug/demo-bistro` must resolve in production (#9334). */
export const DEMO_VENUE_SLUG = "demo-bistro";
/** Fixed id so the row can be written inside its own RLS context (`venues` is keyed on its own id). */
export const DEMO_VENUE_ID = "demo-venue-bistro";
export const DEMO_GROUP_SLUG = "demo-dining";

const TEMPLATE = SEED_VENUES[0];

/**
 * Idempotently creates the demo venue and its availability rows. Safe to re-run:
 * existing rows are left untouched. Writes run inside the venue's RLS context
 * (no BYPASSRLS), so it works against a FORCE'd production database.
 */
export async function ensureDemoVenue(prisma: PrismaClient): Promise<{ venueId: string }> {
  if (!TEMPLATE) throw new Error("No seed venue template available");
  const plan = planVenueMigration(
    {
      operatingHours: TEMPLATE.hours,
      settings: TEMPLATE.settings,
      ianaTimezone: TEMPLATE.ianaTimezone,
    },
    new Date()
  );
  if (plan.kind !== "migrate") throw new Error(`Demo venue hours unreadable: ${plan.reason}`);

  await prisma.$transaction(async (tx) => {
    await setVenueContext(tx, DEMO_VENUE_ID);
    const group = await tx.venueGroup.upsert({
      where: { slug: DEMO_GROUP_SLUG },
      update: {},
      create: {
        name: "Demo Dining",
        slug: DEMO_GROUP_SLUG,
        settings: { timezone: TEMPLATE.ianaTimezone, weekStartsOn: 1, bookingWindowDays: 30 },
      },
    });
    await tx.venue.upsert({
      where: { id: DEMO_VENUE_ID },
      update: {},
      create: {
        id: DEMO_VENUE_ID,
        venueGroupId: group.id,
        name: "Demo Bistro",
        slug: DEMO_VENUE_SLUG,
        ianaTimezone: TEMPLATE.ianaTimezone,
        currencyCode: "USD",
        operatingHours: plan.projection,
        settings: TEMPLATE.settings,
      },
    });
    const rows = await tx.schedule.count({ where: { venueId: DEMO_VENUE_ID, isRegular: true } });
    if (rows === 0) await writeAvailabilityConfig(tx, DEMO_VENUE_ID, plan.config);
  });
  return { venueId: DEMO_VENUE_ID };
}
