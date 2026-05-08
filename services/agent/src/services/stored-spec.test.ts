import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
    storedSpec: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from "./database.js";
import { storedSpecService, mapStoredSpec } from "./stored-spec.js";

const mockSpec = {
  id: "spec-1",
  userId: "user-1",
  prompt: "Build a landing page",
  spec: { components: ["hero", "footer"] },
  rawLines: ["line 1", "line 2"],
  isFavorite: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("stored-spec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("mapStoredSpec", () => {
    it("maps prisma model to response format with ISO date strings", () => {
      const result = mapStoredSpec(mockSpec);

      expect(result).toEqual({
        id: "spec-1",
        userId: "user-1",
        prompt: "Build a landing page",
        spec: { components: ["hero", "footer"] },
        rawLines: ["line 1", "line 2"],
        isFavorite: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    });

    it("preserves isFavorite true value", () => {
      const favorited = { ...mockSpec, isFavorite: true };
      const result = mapStoredSpec(favorited);
      expect(result.isFavorite).toBe(true);
    });
  });

  describe("list", () => {
    it("returns specs for a given user ordered by createdAt desc", async () => {
      vi.mocked(prisma.storedSpec.findMany).mockResolvedValueOnce([mockSpec]);

      const result = await storedSpecService.list("user-1");

      expect(prisma.storedSpec.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      expect(result).toEqual([mockSpec]);
    });

    it("returns empty array when user has no specs", async () => {
      vi.mocked(prisma.storedSpec.findMany).mockResolvedValueOnce([]);
      const result = await storedSpecService.list("user-2");
      expect(result).toEqual([]);
    });
  });

  describe("getById", () => {
    it("returns spec when found", async () => {
      vi.mocked(prisma.storedSpec.findUnique).mockResolvedValueOnce(mockSpec);

      const result = await storedSpecService.getById("spec-1");

      expect(prisma.storedSpec.findUnique).toHaveBeenCalledWith({
        where: { id: "spec-1" },
      });
      expect(result).toEqual(mockSpec);
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.storedSpec.findUnique).mockResolvedValueOnce(null);

      const result = await storedSpecService.getById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("creates a spec and returns the result", async () => {
      vi.mocked(prisma.storedSpec.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.storedSpec.create).mockResolvedValueOnce(mockSpec);

      const result = await storedSpecService.create({
        userId: "user-1",
        prompt: "Build a landing page",
        spec: { components: ["hero", "footer"] },
        rawLines: ["line 1", "line 2"],
      });

      expect(prisma.storedSpec.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          prompt: "Build a landing page",
          spec: { components: ["hero", "footer"] },
          rawLines: ["line 1", "line 2"],
        },
      });
      expect(result).toEqual(mockSpec);
    });

    it("enforces cap by deleting oldest unfavorited spec when at limit", async () => {
      vi.mocked(prisma.storedSpec.count).mockResolvedValueOnce(100);
      vi.mocked(prisma.storedSpec.findFirst).mockResolvedValueOnce({
        id: "oldest-spec",
      } as never);
      vi.mocked(prisma.storedSpec.delete).mockResolvedValueOnce(mockSpec);
      vi.mocked(prisma.storedSpec.create).mockResolvedValueOnce(mockSpec);

      await storedSpecService.create({
        userId: "user-1",
        prompt: "New spec",
        spec: {},
        rawLines: [],
      });

      expect(prisma.storedSpec.findFirst).toHaveBeenCalledWith({
        where: { userId: "user-1", isFavorite: false },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      expect(prisma.storedSpec.delete).toHaveBeenCalledWith({
        where: { id: "oldest-spec" },
      });
    });

    it("does not delete when under the cap", async () => {
      vi.mocked(prisma.storedSpec.count).mockResolvedValueOnce(50);
      vi.mocked(prisma.storedSpec.create).mockResolvedValueOnce(mockSpec);

      await storedSpecService.create({
        userId: "user-1",
        prompt: "New spec",
        spec: {},
        rawLines: [],
      });

      expect(prisma.storedSpec.findFirst).not.toHaveBeenCalled();
      expect(prisma.storedSpec.delete).not.toHaveBeenCalled();
    });
  });

  describe("toggleFavorite", () => {
    it("toggles isFavorite from false to true", async () => {
      vi.mocked(prisma.storedSpec.findUnique).mockResolvedValueOnce(mockSpec);
      const toggled = { ...mockSpec, isFavorite: true };
      vi.mocked(prisma.storedSpec.update).mockResolvedValueOnce(toggled);

      const result = await storedSpecService.toggleFavorite("spec-1", "user-1");

      expect(prisma.storedSpec.update).toHaveBeenCalledWith({
        where: { id: "spec-1" },
        data: { isFavorite: true },
      });
      expect(result.isFavorite).toBe(true);
    });

    it("toggles isFavorite from true to false", async () => {
      const favorited = { ...mockSpec, isFavorite: true };
      vi.mocked(prisma.storedSpec.findUnique).mockResolvedValueOnce(favorited);
      const unfavorited = { ...mockSpec, isFavorite: false };
      vi.mocked(prisma.storedSpec.update).mockResolvedValueOnce(unfavorited);

      const result = await storedSpecService.toggleFavorite("spec-1", "user-1");

      expect(prisma.storedSpec.update).toHaveBeenCalledWith({
        where: { id: "spec-1" },
        data: { isFavorite: false },
      });
      expect(result.isFavorite).toBe(false);
    });

    it("throws when spec does not exist", async () => {
      vi.mocked(prisma.storedSpec.findUnique).mockResolvedValueOnce(null);

      await expect(
        storedSpecService.toggleFavorite("nonexistent", "user-1")
      ).rejects.toThrow("Not found");
    });

    it("throws when spec belongs to different user", async () => {
      vi.mocked(prisma.storedSpec.findUnique).mockResolvedValueOnce(mockSpec);

      await expect(
        storedSpecService.toggleFavorite("spec-1", "other-user")
      ).rejects.toThrow("Not found");
    });
  });

  describe("delete", () => {
    it("deletes a spec owned by the user", async () => {
      vi.mocked(prisma.storedSpec.findUnique).mockResolvedValueOnce(mockSpec);
      vi.mocked(prisma.storedSpec.delete).mockResolvedValueOnce(mockSpec);

      await storedSpecService.delete("spec-1", "user-1");

      expect(prisma.storedSpec.delete).toHaveBeenCalledWith({
        where: { id: "spec-1" },
      });
    });

    it("throws when spec does not exist", async () => {
      vi.mocked(prisma.storedSpec.findUnique).mockResolvedValueOnce(null);

      await expect(
        storedSpecService.delete("nonexistent", "user-1")
      ).rejects.toThrow("Not found");
    });

    it("throws when spec belongs to different user", async () => {
      vi.mocked(prisma.storedSpec.findUnique).mockResolvedValueOnce(mockSpec);

      await expect(
        storedSpecService.delete("spec-1", "other-user")
      ).rejects.toThrow("Not found");
    });
  });

  describe("_enforceCapForUser", () => {
    it("does nothing when count is below cap", async () => {
      vi.mocked(prisma.storedSpec.count).mockResolvedValueOnce(99);

      await storedSpecService._enforceCapForUser("user-1");

      expect(prisma.storedSpec.findFirst).not.toHaveBeenCalled();
    });

    it("deletes oldest unfavorited spec when at cap", async () => {
      vi.mocked(prisma.storedSpec.count).mockResolvedValueOnce(100);
      vi.mocked(prisma.storedSpec.findFirst).mockResolvedValueOnce({
        id: "oldest",
      } as never);
      vi.mocked(prisma.storedSpec.delete).mockResolvedValueOnce(mockSpec);

      await storedSpecService._enforceCapForUser("user-1");

      expect(prisma.storedSpec.delete).toHaveBeenCalledWith({
        where: { id: "oldest" },
      });
    });

    it("handles edge case where no oldest spec is found", async () => {
      vi.mocked(prisma.storedSpec.count).mockResolvedValueOnce(100);
      vi.mocked(prisma.storedSpec.findFirst).mockResolvedValueOnce(null);

      await storedSpecService._enforceCapForUser("user-1");

      expect(prisma.storedSpec.delete).not.toHaveBeenCalled();
    });
  });
});
