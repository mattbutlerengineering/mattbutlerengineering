import { describe, it, expect, vi, beforeEach } from "vitest";
import { recognizeGuest } from "./guest-recognition.js";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      venue: {
        findFirst: vi.fn(),
      },
      guest: {
        findUnique: vi.fn(),
      },
    },
  });
});

import { prisma } from "./database.js";

const mockVenue = {
  id: "venue-123",
  slug: "the-oak-table",
  name: "The Oak Table",
};

describe("recognizeGuest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns recognized guest with first name, phone, visit count, and last visit", async () => {
    vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(mockVenue as never);
    vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce({
      id: "guest-1",
      venueId: "venue-123",
      email: "jane@example.com",
      phone: "+1-555-999-1234",
      name: "Jane Smith",
      notes: null,
      visitCount: 7,
      lifetimeSpend: null,
      lastVisit: new Date("2026-05-01T18:00:00Z"),
      tags: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await recognizeGuest("venue-123", "jane@example.com");

    expect(result).toEqual({
      recognized: true,
      firstName: "Jane",
      phone: "+1-555-999-1234",
      visitCount: 7,
      hasPreferences: false,
      lastVisit: "2026-05-01T18:00:00.000Z",
    });
  });

  it("returns { recognized: false } for unknown email", async () => {
    vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(mockVenue as never);
    vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(null as never);

    const result = await recognizeGuest("venue-123", "unknown@example.com");

    expect(result).toEqual({
      recognized: false,
      firstName: null,
      phone: null,
      visitCount: 0,
      hasPreferences: false,
      lastVisit: null,
    });
  });

  it("returns hasPreferences true when guest has tags", async () => {
    vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(mockVenue as never);
    vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce({
      id: "guest-2",
      venueId: "venue-123",
      email: "vip@example.com",
      phone: null,
      name: "VIP Guest",
      notes: "Prefers corner table",
      visitCount: 12,
      lifetimeSpend: null,
      lastVisit: new Date("2026-05-10T20:00:00Z"),
      tags: ["VIP", "window-seat"],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await recognizeGuest("venue-123", "vip@example.com");

    expect(result).toEqual({
      recognized: true,
      firstName: "VIP",
      phone: null,
      visitCount: 12,
      hasPreferences: true,
      lastVisit: "2026-05-10T20:00:00.000Z",
    });
  });

  it("returns hasPreferences true when guest has notes", async () => {
    vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(mockVenue as never);
    vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce({
      id: "guest-3",
      venueId: "venue-123",
      email: "noted@example.com",
      phone: "+1-555-000-0000",
      name: "Noted Person",
      notes: "Allergic to peanuts",
      visitCount: 3,
      lifetimeSpend: null,
      lastVisit: new Date("2026-04-15T19:00:00Z"),
      tags: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await recognizeGuest("venue-123", "noted@example.com");

    expect(result).toEqual({
      recognized: true,
      firstName: "Noted",
      phone: "+1-555-000-0000",
      visitCount: 3,
      hasPreferences: true,
      lastVisit: "2026-04-15T19:00:00.000Z",
    });
  });

  it("handles guest with no last visit", async () => {
    vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(mockVenue as never);
    vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce({
      id: "guest-4",
      venueId: "venue-123",
      email: "new@example.com",
      phone: null,
      name: "New Guest",
      notes: null,
      visitCount: 0,
      lifetimeSpend: null,
      lastVisit: null,
      tags: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await recognizeGuest("venue-123", "new@example.com");

    expect(result).toEqual({
      recognized: true,
      firstName: "New",
      phone: null,
      visitCount: 0,
      hasPreferences: false,
      lastVisit: null,
    });
  });

  it("never exposes sensitive data (id, notes, lifetimeSpend, tags, email)", async () => {
    vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(mockVenue as never);
    vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce({
      id: "guest-5",
      venueId: "venue-123",
      email: "secret@example.com",
      phone: "+1-555-111-2222",
      name: "Secret Person",
      notes: "Internal notes",
      visitCount: 2,
      lifetimeSpend: 1500,
      lastVisit: new Date("2026-03-01T18:00:00Z"),
      tags: ["VIP"],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await recognizeGuest("venue-123", "secret@example.com");

    // Should NOT have these fields
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("notes");
    expect(result).not.toHaveProperty("lifetimeSpend");
    expect(result).not.toHaveProperty("tags");
    expect(result).not.toHaveProperty("venueId");
  });
});
