import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

function todayAt(hours: number, minutes: number): Date {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding reservations database...");

  // --- Venue Group ---
  const group = await prisma.venueGroup.upsert({
    where: { slug: "downtown-dining" },
    update: {},
    create: {
      name: "Downtown Dining",
      slug: "downtown-dining",
      settings: { timezone: "America/New_York", weekStartsOn: 1, bookingWindowDays: 30 },
    },
  });

  // --- Venues ---
  const venueA = await prisma.venue.upsert({
    where: { venueGroupId_slug: { venueGroupId: group.id, slug: "the-grand-bistro" } },
    update: {},
    create: {
      venueGroupId: group.id,
      name: "The Grand Bistro",
      slug: "the-grand-bistro",
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
      operatingHours: [
        { dayOfWeek: 0, openTime: "10:00", closeTime: "21:00", isClosed: false },
        { dayOfWeek: 1, openTime: "11:00", closeTime: "22:00", isClosed: false },
        { dayOfWeek: 2, openTime: "11:00", closeTime: "22:00", isClosed: false },
        { dayOfWeek: 3, openTime: "11:00", closeTime: "22:00", isClosed: false },
        { dayOfWeek: 4, openTime: "11:00", closeTime: "23:00", isClosed: false },
        { dayOfWeek: 5, openTime: "11:00", closeTime: "23:00", isClosed: false },
        { dayOfWeek: 6, openTime: "10:00", closeTime: "22:00", isClosed: false },
      ],
      settings: { defaultDurationMinutes: 90, maxPartySize: 12 },
    },
  });

  const venueB = await prisma.venue.upsert({
    where: { venueGroupId_slug: { venueGroupId: group.id, slug: "rooftop-lounge" } },
    update: {},
    create: {
      venueGroupId: group.id,
      name: "Rooftop Lounge",
      slug: "rooftop-lounge",
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
      operatingHours: [
        { dayOfWeek: 0, openTime: "16:00", closeTime: "23:00", isClosed: false },
        { dayOfWeek: 1, openTime: "00:00", closeTime: "00:00", isClosed: true },
        { dayOfWeek: 2, openTime: "16:00", closeTime: "23:00", isClosed: false },
        { dayOfWeek: 3, openTime: "16:00", closeTime: "23:00", isClosed: false },
        { dayOfWeek: 4, openTime: "16:00", closeTime: "00:00", isClosed: false },
        { dayOfWeek: 5, openTime: "16:00", closeTime: "01:00", isClosed: false },
        { dayOfWeek: 6, openTime: "14:00", closeTime: "00:00", isClosed: false },
      ],
      settings: { defaultDurationMinutes: 120, maxPartySize: 8 },
    },
  });

  // --- Floor Plans ---
  const floorA = await prisma.floorPlan.create({
    data: {
      venueId: venueA.id,
      name: "Main Floor",
      isActive: true,
      layoutJson: { width: 800, height: 600, background: "#f5f5f5" },
    },
  });

  const floorB = await prisma.floorPlan.create({
    data: {
      venueId: venueB.id,
      name: "Terrace",
      isActive: true,
      layoutJson: { width: 1000, height: 500, background: "#e8f4e8" },
    },
  });

  // --- Tables for Venue A ---
  const tableConfigs = [
    { name: "Table 1", tableNumber: "1", capacity: 2, minCovers: 1, maxCovers: 2, location: "window", shapeMetadata: { shape: "round", radius: 30 } },
    { name: "Table 2", tableNumber: "2", capacity: 2, minCovers: 1, maxCovers: 2, location: "window", shapeMetadata: { shape: "round", radius: 30 } },
    { name: "Table 3", tableNumber: "3", capacity: 4, minCovers: 2, maxCovers: 4, location: "center", shapeMetadata: { shape: "square", width: 60, height: 60 } },
    { name: "Booth A", tableNumber: "B1", capacity: 6, minCovers: 2, maxCovers: 6, location: "wall", shapeMetadata: { shape: "rectangle", width: 80, height: 50 } },
    { name: "Private Room", tableNumber: "PR", capacity: 10, minCovers: 4, maxCovers: 10, location: "private", shapeMetadata: { shape: "rectangle", width: 120, height: 80 } },
  ] as const;

  const tablesA = await Promise.all(
    tableConfigs.map((cfg) =>
      prisma.table.upsert({
        where: { venueId_name: { venueId: venueA.id, name: cfg.name } },
        update: {},
        create: {
          venueId: venueA.id,
          floorPlanId: floorA.id,
          name: cfg.name,
          tableNumber: cfg.tableNumber,
          capacity: cfg.capacity,
          minCovers: cfg.minCovers,
          maxCovers: cfg.maxCovers,
          location: cfg.location,
          shapeMetadata: cfg.shapeMetadata,
          priority: cfg.location === "window" ? 2 : cfg.location === "private" ? 0 : 1,
        },
      }),
    ),
  );

  // --- Tables for Venue B ---
  const rooftopConfigs = [
    { name: "Lounge 1", tableNumber: "L1", capacity: 4, minCovers: 1, maxCovers: 4, location: "terrace", shapeMetadata: { shape: "round", radius: 40 } },
    { name: "Lounge 2", tableNumber: "L2", capacity: 4, minCovers: 1, maxCovers: 4, location: "terrace", shapeMetadata: { shape: "round", radius: 40 } },
    { name: "High Top 1", tableNumber: "H1", capacity: 2, minCovers: 1, maxCovers: 2, location: "bar", shapeMetadata: { shape: "round", radius: 25 } },
    { name: "High Top 2", tableNumber: "H2", capacity: 2, minCovers: 1, maxCovers: 2, location: "bar", shapeMetadata: { shape: "round", radius: 25 } },
    { name: "VIP Booth", tableNumber: "V1", capacity: 8, minCovers: 4, maxCovers: 8, location: "corner", shapeMetadata: { shape: "rectangle", width: 100, height: 60 } },
  ] as const;

  const tablesB = await Promise.all(
    rooftopConfigs.map((cfg) =>
      prisma.table.upsert({
        where: { venueId_name: { venueId: venueB.id, name: cfg.name } },
        update: {},
        create: {
          venueId: venueB.id,
          floorPlanId: floorB.id,
          name: cfg.name,
          tableNumber: cfg.tableNumber,
          capacity: cfg.capacity,
          minCovers: cfg.minCovers,
          maxCovers: cfg.maxCovers,
          location: cfg.location,
          shapeMetadata: cfg.shapeMetadata,
          priority: cfg.location === "corner" ? 0 : 1,
        },
      }),
    ),
  );

  // --- Guests ---
  const guestA = await prisma.guest.upsert({
    where: { venueId_email: { venueId: venueA.id, email: "jane.doe@example.com" } },
    update: {},
    create: {
      venueId: venueA.id,
      name: "Jane Doe",
      email: "jane.doe@example.com",
      phone: "+15551234567",
      notes: "Prefers window seating",
      visitCount: 12,
      tags: ["vip", "regular"],
    },
  });

  const guestB = await prisma.guest.upsert({
    where: { venueId_email: { venueId: venueA.id, email: "bob.smith@example.com" } },
    update: {},
    create: {
      venueId: venueA.id,
      name: "Bob Smith",
      email: "bob.smith@example.com",
      phone: "+15559876543",
      visitCount: 3,
      tags: ["new"],
    },
  });

  const guestC = await prisma.guest.upsert({
    where: { venueId_email: { venueId: venueB.id, email: "maria.garcia@example.com" } },
    update: {},
    create: {
      venueId: venueB.id,
      name: "Maria Garcia",
      email: "maria.garcia@example.com",
      phone: "+15555551234",
      notes: "Allergic to shellfish",
      visitCount: 7,
      tags: ["regular"],
    },
  });

  // --- Reservations ---
  const today = todayDate();

  const reservations = [
    {
      date: today,
      startTime: todayAt(18, 0),
      endTime: todayAt(19, 30),
      partySize: 2,
      status: "CONFIRMED" as const,
      guestName: "Jane Doe",
      guestEmail: "jane.doe@example.com",
      guestId: guestA.id,
      tableId: tablesA[0]!.id,
      venueId: venueA.id,
      notes: "Anniversary dinner",
    },
    {
      date: today,
      startTime: todayAt(19, 0),
      endTime: todayAt(20, 30),
      partySize: 4,
      status: "PENDING" as const,
      guestName: "Bob Smith",
      guestEmail: "bob.smith@example.com",
      guestId: guestB.id,
      tableId: tablesA[2]!.id,
      venueId: venueA.id,
    },
    {
      date: today,
      startTime: todayAt(20, 0),
      endTime: todayAt(21, 30),
      partySize: 6,
      status: "PENDING" as const,
      guestName: "Walk-in Party",
      tableId: tablesA[3]!.id,
      venueId: venueA.id,
    },
    {
      date: today,
      startTime: todayAt(18, 30),
      endTime: todayAt(20, 30),
      partySize: 4,
      status: "CANCELLED" as const,
      guestName: "Maria Garcia",
      guestEmail: "maria.garcia@example.com",
      guestId: guestC.id,
      tableId: tablesB[0]!.id,
      venueId: venueB.id,
      cancellationReason: "GUEST_REQUEST",
      cancellationNote: "Schedule conflict",
    },
    {
      date: today,
      startTime: todayAt(17, 0),
      endTime: todayAt(18, 30),
      partySize: 2,
      status: "COMPLETED" as const,
      guestName: "Jane Doe",
      guestEmail: "jane.doe@example.com",
      tableId: tablesB[2]!.id,
      venueId: venueB.id,
    },
  ];

  const createdReservations = await Promise.all(
    reservations.map((r) => prisma.reservation.create({ data: r })),
  );

  console.log("Seeded reservations database:", {
    venueGroup: group.id,
    venues: [venueA.id, venueB.id],
    floorPlans: [floorA.id, floorB.id],
    tables: { venueA: tablesA.length, venueB: tablesB.length },
    guests: [guestA.id, guestB.id, guestC.id],
    reservations: createdReservations.length,
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
