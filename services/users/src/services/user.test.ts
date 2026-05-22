import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from "./database.js";
import { userService } from "./user.js";

const NOW = new Date("2026-01-25T00:00:00.000Z");
const LATER = new Date("2026-01-26T12:00:00.000Z");

function makePrismaUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "alice@example.com",
    name: "Alice",
    picture: "https://example.com/alice.jpg",
    emailVerified: true,
    preferences: { theme: "dark" },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function prismaNotFoundError(): Error {
  const err = new Error("Not found") as Error & { code: string };
  err.code = "P2025";
  return err;
}

describe("userService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── list ──────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns paginated users ordered by createdAt desc", async () => {
      const prismaUsers = [
        makePrismaUser(),
        makePrismaUser({ id: "user-2", email: "bob@example.com" }),
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce(prismaUsers as never);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(2 as never);

      const result = await userService.list(1, 10);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: { createdAt: "desc" },
      });
      expect(prisma.user.count).toHaveBeenCalled();
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it("calculates skip correctly for page 3 with limit 5", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(20 as never);

      await userService.list(3, 5);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      );
    });

    it("returns hasNext=true when more pages exist", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([makePrismaUser()] as never);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(25 as never);

      const result = await userService.list(1, 10);

      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(false);
      expect(result.pagination.totalPages).toBe(3);
    });

    it("returns hasPrev=true on subsequent pages", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([makePrismaUser()] as never);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(25 as never);

      const result = await userService.list(2, 10);

      expect(result.pagination.hasPrev).toBe(true);
    });

    it("handles empty results", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(0 as never);

      const result = await userService.list(1, 10);

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it("maps Prisma dates to ISO strings", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([makePrismaUser()] as never);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(1 as never);

      const result = await userService.list(1, 10);

      expect(result.data[0].createdAt).toBe("2026-01-25T00:00:00.000Z");
      expect(result.data[0].updatedAt).toBe("2026-01-25T00:00:00.000Z");
    });

    it("returns single-page pagination when total equals limit", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) =>
          makePrismaUser({ id: `user-${i}`, email: `user${i}@example.com` })
        ) as never
      );
      vi.mocked(prisma.user.count).mockResolvedValueOnce(10 as never);

      const result = await userService.list(1, 10);

      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNext).toBe(false);
    });
  });

  // ── getById ───────────────────────────────────────────────────────

  describe("getById", () => {
    it("returns mapped user when found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makePrismaUser() as never);

      const result = await userService.getById("user-1");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
      expect(result).toEqual({
        id: "user-1",
        email: "alice@example.com",
        name: "Alice",
        picture: "https://example.com/alice.jpg",
        emailVerified: true,
        preferences: { theme: "dark" },
        createdAt: "2026-01-25T00:00:00.000Z",
        updatedAt: "2026-01-25T00:00:00.000Z",
      });
    });

    it("returns null when user not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);

      const result = await userService.getById("nonexistent");

      expect(result).toBeNull();
    });
  });

  // ── getByEmail ────────────────────────────────────────────────────

  describe("getByEmail", () => {
    it("returns mapped user when found by email", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makePrismaUser() as never);

      const result = await userService.getByEmail("alice@example.com");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "alice@example.com" },
      });
      expect(result?.email).toBe("alice@example.com");
    });

    it("returns null when email not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);

      const result = await userService.getByEmail("unknown@example.com");

      expect(result).toBeNull();
    });
  });

  // ── create ────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates user with all fields", async () => {
      const created = makePrismaUser();
      vi.mocked(prisma.user.create).mockResolvedValueOnce(created as never);

      const result = await userService.create({
        email: "alice@example.com",
        name: "Alice",
        picture: "https://example.com/alice.jpg",
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: "alice@example.com",
          name: "Alice",
          picture: "https://example.com/alice.jpg",
        },
      });
      expect(result.email).toBe("alice@example.com");
      expect(result.name).toBe("Alice");
    });

    it("creates user with email only, defaulting name and picture to null", async () => {
      const created = makePrismaUser({ name: null, picture: null });
      vi.mocked(prisma.user.create).mockResolvedValueOnce(created as never);

      const result = await userService.create({ email: "minimal@example.com" });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: "minimal@example.com",
          name: null,
          picture: null,
        },
      });
      expect(result.name).toBeNull();
      expect(result.picture).toBeNull();
    });

    it("propagates Prisma errors (e.g. unique constraint)", async () => {
      const uniqueError = new Error("Unique constraint failed on email");
      vi.mocked(prisma.user.create).mockRejectedValueOnce(uniqueError);

      await expect(userService.create({ email: "dupe@example.com" })).rejects.toThrow(
        "Unique constraint failed on email"
      );
    });
  });

  // ── findOrCreate ──────────────────────────────────────────────────

  describe("findOrCreate", () => {
    it("returns existing user via upsert (no-op update)", async () => {
      const existing = makePrismaUser();
      vi.mocked(prisma.user.upsert).mockResolvedValueOnce(existing as never);

      const result = await userService.findOrCreate({
        email: "alice@example.com",
        name: "Alice",
        picture: "https://example.com/alice.jpg",
      });

      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { email: "alice@example.com" },
        update: {},
        create: {
          email: "alice@example.com",
          name: "Alice",
          picture: "https://example.com/alice.jpg",
        },
      });
      expect(result.id).toBe("user-1");
    });

    it("creates new user when not found via upsert", async () => {
      const newUser = makePrismaUser({ id: "user-new" });
      vi.mocked(prisma.user.upsert).mockResolvedValueOnce(newUser as never);

      const result = await userService.findOrCreate({ email: "new@example.com" });

      expect(result.id).toBe("user-new");
    });

    it("defaults name and picture to null when omitted", async () => {
      vi.mocked(prisma.user.upsert).mockResolvedValueOnce(
        makePrismaUser({ name: null, picture: null }) as never
      );

      await userService.findOrCreate({ email: "new@example.com" });

      expect(prisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { email: "new@example.com", name: null, picture: null },
        })
      );
    });
  });

  // ── update ────────────────────────────────────────────────────────

  describe("update", () => {
    it("updates user name", async () => {
      const updated = makePrismaUser({ name: "New Name", updatedAt: LATER });
      vi.mocked(prisma.user.update).mockResolvedValueOnce(updated as never);

      const result = await userService.update("user-1", { name: "New Name" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { name: "New Name" },
      });
      expect(result?.name).toBe("New Name");
    });

    it("updates user picture", async () => {
      const updated = makePrismaUser({ picture: "https://example.com/new.jpg" });
      vi.mocked(prisma.user.update).mockResolvedValueOnce(updated as never);

      const result = await userService.update("user-1", {
        picture: "https://example.com/new.jpg",
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { picture: "https://example.com/new.jpg" },
      });
      expect(result?.picture).toBe("https://example.com/new.jpg");
    });

    it("updates both name and picture simultaneously", async () => {
      const updated = makePrismaUser({ name: "Bob", picture: "https://example.com/bob.jpg" });
      vi.mocked(prisma.user.update).mockResolvedValueOnce(updated as never);

      const result = await userService.update("user-1", {
        name: "Bob",
        picture: "https://example.com/bob.jpg",
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { name: "Bob", picture: "https://example.com/bob.jpg" },
      });
      expect(result?.name).toBe("Bob");
      expect(result?.picture).toBe("https://example.com/bob.jpg");
    });

    it("only includes provided fields in the update data", async () => {
      vi.mocked(prisma.user.update).mockResolvedValueOnce(makePrismaUser() as never);

      await userService.update("user-1", { name: "Only Name" });

      const callData = vi.mocked(prisma.user.update).mock.calls[0][0].data;
      expect(callData).toHaveProperty("name", "Only Name");
      expect(callData).not.toHaveProperty("picture");
    });

    it("sends empty data object when called with no fields", async () => {
      vi.mocked(prisma.user.update).mockResolvedValueOnce(makePrismaUser() as never);

      await userService.update("user-1", {});

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {},
      });
    });

    it("returns null when user not found (P2025)", async () => {
      vi.mocked(prisma.user.update).mockRejectedValueOnce(prismaNotFoundError());

      const result = await userService.update("nonexistent", { name: "Nope" });

      expect(result).toBeNull();
    });

    it("propagates non-P2025 errors", async () => {
      const dbError = new Error("Connection lost");
      vi.mocked(prisma.user.update).mockRejectedValueOnce(dbError);

      await expect(userService.update("user-1", { name: "X" })).rejects.toThrow("Connection lost");
    });
  });

  // ── delete ────────────────────────────────────────────────────────

  describe("delete", () => {
    it("returns true when user is deleted", async () => {
      vi.mocked(prisma.user.delete).mockResolvedValueOnce(makePrismaUser() as never);

      const result = await userService.delete("user-1");

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
      expect(result).toBe(true);
    });

    it("returns false when user not found (P2025)", async () => {
      vi.mocked(prisma.user.delete).mockRejectedValueOnce(prismaNotFoundError());

      const result = await userService.delete("nonexistent");

      expect(result).toBe(false);
    });

    it("propagates non-P2025 errors", async () => {
      const dbError = new Error("FK constraint violation");
      vi.mocked(prisma.user.delete).mockRejectedValueOnce(dbError);

      await expect(userService.delete("user-1")).rejects.toThrow("FK constraint violation");
    });
  });

  // ── updatePreferences ─────────────────────────────────────────────

  describe("updatePreferences", () => {
    it("merges new preferences with existing ones", async () => {
      const existingUser = makePrismaUser({
        preferences: { theme: "light", emailNotifications: true },
      });
      const updatedUser = makePrismaUser({
        preferences: { theme: "dark", emailNotifications: true },
        updatedAt: LATER,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser as never);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser as never);

      const result = await userService.updatePreferences("user-1", { theme: "dark" });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          preferences: { theme: "dark", emailNotifications: true },
        },
      });
      expect(result?.preferences).toEqual({ theme: "dark", emailNotifications: true });
    });

    it("handles user with null/empty preferences", async () => {
      const existingUser = makePrismaUser({ preferences: null });
      const updatedUser = makePrismaUser({
        preferences: { theme: "system" },
        updatedAt: LATER,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser as never);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser as never);

      await userService.updatePreferences("user-1", { theme: "system" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          preferences: { theme: "system" },
        },
      });
    });

    it("returns null when user not found on initial lookup", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);

      const result = await userService.updatePreferences("nonexistent", { theme: "dark" });

      expect(result).toBeNull();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("returns null when P2025 on update (race condition)", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makePrismaUser() as never);
      vi.mocked(prisma.user.update).mockRejectedValueOnce(prismaNotFoundError());

      const result = await userService.updatePreferences("user-1", { theme: "dark" });

      expect(result).toBeNull();
    });

    it("propagates non-P2025 errors from update", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makePrismaUser() as never);
      vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error("DB timeout"));

      await expect(userService.updatePreferences("user-1", { theme: "dark" })).rejects.toThrow(
        "DB timeout"
      );
    });

    it("preserves existing preferences that are not overridden", async () => {
      const existingUser = makePrismaUser({
        preferences: { theme: "light", emailNotifications: true, marketingEmails: false },
      });
      const updatedUser = makePrismaUser({
        preferences: { theme: "light", emailNotifications: false, marketingEmails: false },
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser as never);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser as never);

      await userService.updatePreferences("user-1", { emailNotifications: false });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          preferences: { theme: "light", emailNotifications: false, marketingEmails: false },
        },
      });
    });
  });

  // ── mapPrismaUser (tested via public methods) ─────────────────────

  describe("mapPrismaUser (via public methods)", () => {
    it("converts Date objects to ISO strings", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        makePrismaUser({
          createdAt: new Date("2025-06-15T10:30:00.000Z"),
          updatedAt: new Date("2025-12-25T23:59:59.999Z"),
        }) as never
      );

      const result = await userService.getById("user-1");

      expect(result?.createdAt).toBe("2025-06-15T10:30:00.000Z");
      expect(result?.updatedAt).toBe("2025-12-25T23:59:59.999Z");
    });

    it("preserves null name and picture", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        makePrismaUser({ name: null, picture: null }) as never
      );

      const result = await userService.getById("user-1");

      expect(result?.name).toBeNull();
      expect(result?.picture).toBeNull();
    });

    it("defaults preferences to empty object when null", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        makePrismaUser({ preferences: null }) as never
      );

      const result = await userService.getById("user-1");

      expect(result?.preferences).toEqual({});
    });

    it("defaults preferences to empty object when undefined", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        makePrismaUser({ preferences: undefined }) as never
      );

      const result = await userService.getById("user-1");

      expect(result?.preferences).toEqual({});
    });

    it("passes through valid preferences object", async () => {
      const prefs = { theme: "dark", emailNotifications: true };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        makePrismaUser({ preferences: prefs }) as never
      );

      const result = await userService.getById("user-1");

      expect(result?.preferences).toEqual(prefs);
    });

    it("maps emailVerified boolean correctly", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        makePrismaUser({ emailVerified: false }) as never
      );

      const result = await userService.getById("user-1");

      expect(result?.emailVerified).toBe(false);
    });
  });
});
