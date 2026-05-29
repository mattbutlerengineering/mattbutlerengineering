/**
 * TDD tests for dietary restrictions on the Guest model.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
    guest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { guestService } from "./guest.js";
import { prisma } from "./database.js";
import { Prisma } from "../generated/prisma/index.js";

const NOW = new Date("2026-05-01T12:00:00Z");

function makePrismaGuest(overrides: Record<string, unknown> = {}) {
  return {
    id: "guest-1",
    venueId: "venue-1",
    email: "guest@example.com",
    phone: "+15551234567",
    name: "Jane Doe",
    notes: null,
    visitCount: 0,
    lifetimeSpend: null,
    lastVisit: null,
    tags: null,
    dietaryRestrictions: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("guestService — dietary restrictions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create with dietaryRestrictions", () => {
    it("stores dietary restrictions on create", async () => {
      const prismaGuest = makePrismaGuest({ dietaryRestrictions: ["gluten-free", "nut-allergy"] });
      vi.mocked(prisma.guest.create).mockResolvedValueOnce(prismaGuest as never);

      const result = await guestService.create({
        venueId: "venue-1",
        name: "Jane Doe",
        email: "guest@example.com",
        dietaryRestrictions: ["gluten-free", "nut-allergy"],
      });

      expect(result.dietaryRestrictions).toEqual(["gluten-free", "nut-allergy"]);
      expect(prisma.guest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dietaryRestrictions: ["gluten-free", "nut-allergy"],
        }),
      });
    });

    it("creates guest with null dietaryRestrictions when not provided", async () => {
      vi.mocked(prisma.guest.create).mockResolvedValueOnce(makePrismaGuest() as never);

      const result = await guestService.create({
        venueId: "venue-1",
        name: "Jane Doe",
      });

      expect(result.dietaryRestrictions).toBeNull();
    });
  });

  describe("update with dietaryRestrictions", () => {
    it("updates dietary restrictions", async () => {
      vi.mocked(prisma.guest.update).mockResolvedValueOnce(
        makePrismaGuest({ dietaryRestrictions: ["vegan"] }) as never
      );

      const result = await guestService.update("guest-1", {
        dietaryRestrictions: ["vegan"],
      });

      expect(result!.dietaryRestrictions).toEqual(["vegan"]);
      expect(prisma.guest.update).toHaveBeenCalledWith({
        where: { id: "guest-1" },
        data: expect.objectContaining({
          dietaryRestrictions: ["vegan"],
        }),
      });
    });

    it("clears dietary restrictions when set to null", async () => {
      vi.mocked(prisma.guest.update).mockResolvedValueOnce(
        makePrismaGuest({ dietaryRestrictions: null }) as never
      );

      const result = await guestService.update("guest-1", {
        dietaryRestrictions: null,
      });

      expect(result!.dietaryRestrictions).toBeNull();
      expect(prisma.guest.update).toHaveBeenCalledWith({
        where: { id: "guest-1" },
        data: expect.objectContaining({
          dietaryRestrictions: Prisma.DbNull,
        }),
      });
    });
  });

  describe("findOrCreate merges dietary restrictions", () => {
    it("unions dietary restrictions when finding existing guest by email", async () => {
      const existing = makePrismaGuest({ dietaryRestrictions: ["gluten-free"] });
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(existing as never);
      const updated = makePrismaGuest({
        dietaryRestrictions: ["gluten-free", "dairy-free"],
      });
      vi.mocked(prisma.guest.update).mockResolvedValueOnce(updated as never);

      const result = await guestService.findOrCreate("venue-1", {
        email: "guest@example.com",
        name: "Jane Doe",
        dietaryRestrictions: ["dairy-free"],
      });

      expect(result.dietaryRestrictions).toEqual(["gluten-free", "dairy-free"]);
      expect(prisma.guest.update).toHaveBeenCalledWith({
        where: { id: "guest-1" },
        data: expect.objectContaining({
          dietaryRestrictions: expect.arrayContaining(["gluten-free", "dairy-free"]),
        }),
      });
    });

    it("does not duplicate existing restrictions in the union", async () => {
      // ["vegan"] is already a subset of ["vegan","gluten-free"] — no update is made
      const existing = makePrismaGuest({ dietaryRestrictions: ["vegan", "gluten-free"] });
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(existing as never);

      const result = await guestService.findOrCreate("venue-1", {
        email: "guest@example.com",
        name: "Jane Doe",
        dietaryRestrictions: ["vegan"],
      });

      // union of ["vegan","gluten-free"] and ["vegan"] = ["vegan","gluten-free"] (no duplicates)
      // No update call — existing guest returned as-is
      expect(result.dietaryRestrictions).toEqual(["vegan", "gluten-free"]);
      expect(prisma.guest.update).not.toHaveBeenCalled();
    });

    it("does not update if incoming restrictions are already a subset", async () => {
      const existing = makePrismaGuest({ dietaryRestrictions: ["vegan", "gluten-free"] });
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(existing as never);

      await guestService.findOrCreate("venue-1", {
        email: "guest@example.com",
        name: "Jane Doe",
        dietaryRestrictions: ["vegan"],
      });

      // No update needed — incoming is already a subset of existing
      expect(prisma.guest.update).not.toHaveBeenCalled();
    });

    it("merges dietary restrictions when finding by phone", async () => {
      // No email provided — only phone lookup happens (single findUnique call)
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(
        makePrismaGuest({ dietaryRestrictions: ["nut-allergy"] }) as never
      );
      const updated = makePrismaGuest({
        dietaryRestrictions: ["nut-allergy", "shellfish-allergy"],
      });
      vi.mocked(prisma.guest.update).mockResolvedValueOnce(updated as never);

      const result = await guestService.findOrCreate("venue-1", {
        phone: "+15551234567",
        name: "Jane Doe",
        dietaryRestrictions: ["shellfish-allergy"],
      });

      expect(result.dietaryRestrictions).toEqual(["nut-allergy", "shellfish-allergy"]);
    });

    it("creates new guest with dietaryRestrictions when no match found", async () => {
      // Only email provided (no phone) → single findUnique call (email miss), then create
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(null as never);
      vi.mocked(prisma.guest.create).mockResolvedValueOnce(
        makePrismaGuest({ dietaryRestrictions: ["kosher"] }) as never
      );

      const result = await guestService.findOrCreate("venue-1", {
        email: "new@example.com",
        name: "New Guest",
        dietaryRestrictions: ["kosher"],
      });

      expect(result.dietaryRestrictions).toEqual(["kosher"]);
      expect(prisma.guest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dietaryRestrictions: ["kosher"],
        }),
      });
    });
  });

  describe("mapPrismaGuest includes dietaryRestrictions", () => {
    it("maps dietaryRestrictions from Prisma to domain Guest", async () => {
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(
        makePrismaGuest({ dietaryRestrictions: ["halal", "no-pork"] }) as never
      );

      const result = await guestService.getById("guest-1");

      expect(result).not.toBeNull();
      expect(result!.dietaryRestrictions).toEqual(["halal", "no-pork"]);
    });

    it("maps null dietaryRestrictions as null", async () => {
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(
        makePrismaGuest({ dietaryRestrictions: null }) as never
      );

      const result = await guestService.getById("guest-1");

      expect(result!.dietaryRestrictions).toBeNull();
    });
  });
});
