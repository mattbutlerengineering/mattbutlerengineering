import type { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { planVenueMigration, writeAvailabilityConfig } from "./availability-migration.js";
import { SEED_VENUES } from "../test/seed-venues.js";

/** Canonical public demo venue: `GET /api/v1/venues/by-slug/demo-bistro` must resolve in production (#9334). */
export const DEMO_VENUE_SLUG = "demo-bistro";
/** Fixed id so the row can be written inside its own RLS context (`venues` is keyed on its own id). */
export const DEMO_VENUE_ID = "demo-venue-bistro";
const DEMO_GROUP_SLUG = "demo-dining";

const TEMPLATE = SEED_VENUES[0];
const DEMO_FLOOR_NAME = "Main Floor";

/** Varied capacities 2-10 so party-size availability is non-trivial. x/y are canvas coordinates. */
const DEMO_TABLES = [
  {
    name: "Table 1",
    tableNumber: "1",
    capacity: 2,
    minCovers: 1,
    maxCovers: 2,
    location: "window",
    shape: { shape: "round", radius: 30, x: 80, y: 80 },
  },
  {
    name: "Table 2",
    tableNumber: "2",
    capacity: 2,
    minCovers: 1,
    maxCovers: 2,
    location: "window",
    shape: { shape: "round", radius: 30, x: 80, y: 180 },
  },
  {
    name: "Table 3",
    tableNumber: "3",
    capacity: 4,
    minCovers: 2,
    maxCovers: 4,
    location: "center",
    shape: { shape: "square", width: 60, height: 60, x: 280, y: 120 },
  },
  {
    name: "Table 4",
    tableNumber: "4",
    capacity: 4,
    minCovers: 2,
    maxCovers: 4,
    location: "center",
    shape: { shape: "square", width: 60, height: 60, x: 280, y: 260 },
  },
  {
    name: "Booth A",
    tableNumber: "B1",
    capacity: 6,
    minCovers: 2,
    maxCovers: 6,
    location: "wall",
    shape: { shape: "rectangle", width: 80, height: 50, x: 520, y: 100 },
  },
  {
    name: "Private Room",
    tableNumber: "PR",
    capacity: 10,
    minCovers: 4,
    maxCovers: 10,
    location: "private",
    shape: { shape: "rectangle", width: 120, height: 80, x: 600, y: 420 },
  },
] as const;

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

    const floor =
      (await tx.floorPlan.findFirst({
        where: { venueId: DEMO_VENUE_ID, name: DEMO_FLOOR_NAME, archivedAt: null },
      })) ??
      (await tx.floorPlan.create({
        data: {
          venueId: DEMO_VENUE_ID,
          name: DEMO_FLOOR_NAME,
          isActive: true,
          layoutJson: { width: 800, height: 600, background: "#f5f5f5" },
        },
      }));
    for (const t of DEMO_TABLES) {
      await tx.table.upsert({
        where: { venueId_name: { venueId: DEMO_VENUE_ID, name: t.name } },
        update: {},
        create: {
          venueId: DEMO_VENUE_ID,
          floorPlanId: floor.id,
          name: t.name,
          tableNumber: t.tableNumber,
          capacity: t.capacity,
          minCovers: t.minCovers,
          maxCovers: t.maxCovers,
          location: t.location,
          shapeMetadata: t.shape,
          priority: t.location === "window" ? 2 : t.location === "private" ? 0 : 1,
        },
      });
    }
  });
  return { venueId: DEMO_VENUE_ID };
}
