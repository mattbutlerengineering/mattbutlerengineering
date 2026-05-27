/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
    waitlistEntry: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { waitlistService } from "./waitlist.js";
import { prisma } from "./database.js";

const db = prisma as any;

const NOW = new Date("2026-05-27T12:00:00Z");

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    venueId: "venue-1",
    guestName: "Alice",
    guestPhone: "+15555550001",
    partySize: 2,
    status: "WAITING",
    position: 1,
    notifyJobId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("waitlistService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("add", () => {
    it("creates entry at next position", async () => {
      db.waitlistEntry.count.mockResolvedValue(2);
      db.waitlistEntry.create.mockResolvedValue(makeEntry({ position: 3 }));

      const entry = await waitlistService.add({
        venueId: "venue-1",
        guestName: "Alice",
        guestPhone: "+15555550001",
        partySize: 2,
      });

      expect(db.waitlistEntry.count).toHaveBeenCalledWith({
        where: { venueId: "venue-1", status: "WAITING" },
      });
      expect(db.waitlistEntry.create).toHaveBeenCalledWith({
        data: {
          venueId: "venue-1",
          guestName: "Alice",
          guestPhone: "+15555550001",
          partySize: 2,
          position: 3,
          status: "WAITING",
        },
      });
      expect(entry.position).toBe(3);
      expect(entry.status).toBe("WAITING");
    });

    it("maps createdAt/updatedAt to ISO strings", async () => {
      db.waitlistEntry.count.mockResolvedValue(0);
      db.waitlistEntry.create.mockResolvedValue(makeEntry({ position: 1 }));

      const entry = await waitlistService.add({
        venueId: "venue-1",
        guestName: "Bob",
        guestPhone: "+15555550002",
        partySize: 4,
      });

      expect(typeof entry.createdAt).toBe("string");
      expect(entry.createdAt).toContain("2026");
    });
  });

  describe("listWaiting", () => {
    it("returns waiting entries ordered by position", async () => {
      db.waitlistEntry.findMany.mockResolvedValue([
        makeEntry({ position: 1 }),
        makeEntry({ id: "entry-2", position: 2 }),
      ]);

      const entries = await waitlistService.listWaiting("venue-1");

      expect(db.waitlistEntry.findMany).toHaveBeenCalledWith({
        where: { venueId: "venue-1", status: "WAITING" },
        orderBy: { position: "asc" },
      });
      expect(entries).toHaveLength(2);
    });
  });

  describe("getById", () => {
    it("returns entry when found", async () => {
      db.waitlistEntry.findUnique.mockResolvedValue(makeEntry());
      const entry = await waitlistService.getById("entry-1");
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe("entry-1");
    });

    it("returns null when not found", async () => {
      db.waitlistEntry.findUnique.mockResolvedValue(null);
      const entry = await waitlistService.getById("missing");
      expect(entry).toBeNull();
    });
  });

  describe("updateStatus", () => {
    it("updates status", async () => {
      db.waitlistEntry.update.mockResolvedValue(makeEntry({ status: "NOTIFIED" }));
      const entry = await waitlistService.updateStatus("entry-1", "NOTIFIED");
      expect(entry!.status).toBe("NOTIFIED");
      expect(db.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: "entry-1" },
        data: { status: "NOTIFIED" },
      });
    });

    it("includes notifyJobId when provided", async () => {
      db.waitlistEntry.update.mockResolvedValue(
        makeEntry({ status: "NOTIFIED", notifyJobId: "job-abc" })
      );
      await waitlistService.updateStatus("entry-1", "NOTIFIED", "job-abc");
      expect(db.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: "entry-1" },
        data: { status: "NOTIFIED", notifyJobId: "job-abc" },
      });
    });

    it("returns null on error", async () => {
      db.waitlistEntry.update.mockRejectedValue(new Error("not found"));
      const result = await waitlistService.updateStatus("missing", "SEATED");
      expect(result).toBeNull();
    });
  });

  describe("remove", () => {
    it("sets status to REMOVED", async () => {
      db.waitlistEntry.update.mockResolvedValue(makeEntry({ status: "REMOVED" }));
      const result = await waitlistService.remove("entry-1");
      expect(result).toBe(true);
      expect(db.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: "entry-1" },
        data: { status: "REMOVED" },
      });
    });

    it("returns false on error", async () => {
      db.waitlistEntry.update.mockRejectedValue(new Error("not found"));
      const result = await waitlistService.remove("missing");
      expect(result).toBe(false);
    });
  });

  describe("getNext", () => {
    it("returns the first WAITING entry", async () => {
      db.waitlistEntry.findFirst.mockResolvedValue(makeEntry({ position: 1 }));
      const entry = await waitlistService.getNext("venue-1");
      expect(entry).not.toBeNull();
      expect(entry!.position).toBe(1);
      expect(db.waitlistEntry.findFirst).toHaveBeenCalledWith({
        where: { venueId: "venue-1", status: "WAITING" },
        orderBy: { position: "asc" },
      });
    });

    it("returns null when queue is empty", async () => {
      db.waitlistEntry.findFirst.mockResolvedValue(null);
      const entry = await waitlistService.getNext("venue-1");
      expect(entry).toBeNull();
    });
  });
});
