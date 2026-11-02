import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as Availability from "@mbe/availability";
import type { NoticeOutcome } from "./closure-notice.js";

const { rebookRequiresDeposit, loadAvailabilitySnapshot, rebookOffers } = vi.hoisted(() => ({
  rebookRequiresDeposit: vi.fn(),
  loadAvailabilitySnapshot: vi.fn(),
  rebookOffers: vi.fn(),
}));

vi.mock("./manage-rebook-deps.js", () => ({ rebookRequiresDeposit }));
vi.mock("./availability-snapshot.js", () => ({ loadAvailabilitySnapshot }));
vi.mock("./database.js", () => ({ prisma: {} }));
vi.mock("@mbe/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof Availability>()),
  rebookOffers,
}));

const { loadNoticeOutcome, loadRebookSlots, listNotifiable, listSummaries } =
  await import("./closure-notice-store.js");

const now = new Date("2026-10-20T12:00:00Z");
const slot = new Date("2026-10-22T02:00:00Z");

const outcome = {
  outcomeId: "out_1",
  venueId: "v1",
  reservationId: "res_1",
  action: "cancel",
  deliveries: {},
  rebooked: false,
  closureDate: "2026-10-21",
  message: null,
  startTime: new Date("2026-10-22T01:00:00Z"),
  partySize: 2,
  guestName: "Ana",
  guestEmail: "ana@example.com",
  guestPhone: "+15555550100",
  preference: null,
  refund: null,
  venueName: "Rialto",
  timezone: "America/Los_Angeles",
  originHost: null,
} satisfies NoticeOutcome;

describe("loadRebookSlots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAvailabilitySnapshot.mockResolvedValue({ snapshot: {} });
    rebookOffers.mockReturnValue({ kind: "offers", slots: [{ start: slot }] });
  });

  it("offers open slots when a rebook needs no deposit", async () => {
    rebookRequiresDeposit.mockResolvedValue(false);
    await expect(loadRebookSlots(outcome, now)).resolves.toEqual([slot]);
    expect(rebookRequiresDeposit).toHaveBeenCalledWith("v1", {
      guestEmail: "ana@example.com",
      guestPhone: "+15555550100",
    });
  });

  it("offers no one-tap slots at a deposit venue, which the rebook route would refuse", async () => {
    rebookRequiresDeposit.mockResolvedValue(true);
    await expect(loadRebookSlots(outcome, now)).resolves.toEqual([]);
    expect(loadAvailabilitySnapshot).not.toHaveBeenCalled();
  });
});

// #7892: the closure notice carries the reservation's origin host so the
// email it sends can brand by it.
describe("loadNoticeOutcome", () => {
  function makeRow(reservationOverrides: Record<string, unknown> = {}) {
    return {
      id: "out_1",
      venueId: "v1",
      reservationId: "res_1",
      action: "cancel",
      deliveries: {},
      rebookedReservationId: null,
      dateRule: { guestMessage: null },
      venue: { name: "Rialto", ianaTimezone: "America/Los_Angeles" },
      reservation: {
        date: new Date("2026-10-21"),
        startTime: new Date("2026-10-22T01:00:00Z"),
        partySize: 2,
        guestName: "Ana",
        guestEmail: "ana@example.com",
        guestPhone: "+15555550100",
        guest: null,
        deposit: null,
        originHost: null,
        ...reservationOverrides,
      },
    };
  }

  it("carries the reservation's originHost", async () => {
    const db = {
      closureOutcome: {
        findUnique: vi.fn().mockResolvedValue(makeRow({ originHost: "eat-sheet.com" })),
      },
    };
    const result = await loadNoticeOutcome("out_1", db as never);
    expect(result?.originHost).toBe("eat-sheet.com");
  });

  it("is null for a booking with no origin", async () => {
    const db = { closureOutcome: { findUnique: vi.fn().mockResolvedValue(makeRow()) } };
    const result = await loadNoticeOutcome("out_1", db as never);
    expect(result?.originHost).toBeNull();
  });
});

describe("listSummaries", () => {
  const row = (id: string, action: string, startTime: Date) => ({
    id,
    dateRuleId: "r1",
    action,
    deliveries: {},
    rebookedReservationId: null,
    refund: "none",
    reservation: { guestName: id, startTime, deposit: null },
  });

  it("counts the cancelled guests a reopen notice can still reach, apart from all cancelled", async () => {
    const ahead = new Date(now.getTime() + 86_400_000);
    const over = new Date(now.getTime() - 86_400_000);
    const db = {
      closureOutcome: {
        findMany: vi.fn(async () => [
          row("a", "cancel", ahead),
          row("b", "cancel", over),
          row("c", "cancel", over),
          row("d", "keep_notify", ahead),
        ]),
      },
    };

    const [summary] = await listSummaries("v1", now, db as never);

    expect(summary).toMatchObject({ ruleId: "r1", cancelled: 3, upcomingCancelled: 1 });
  });
});

describe("listNotifiable", () => {
  const find = (rows: { id: string }[] = [{ id: "o1" }]) => ({
    closureOutcome: { findMany: vi.fn(async () => rows) },
  });

  it("tells a cancelled guest to rebook only a booking that has not yet started (#7975)", async () => {
    const db = find();
    await expect(listNotifiable("v1", "r1", "reopened", now, db as never)).resolves.toEqual([
      { outcomeId: "o1" },
    ]);
    expect(db.closureOutcome.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: "cancel",
          reservation: { startTime: { gt: now } },
        }),
      })
    );
  });

  it("leaves the closure notice to everyone but a silent keep, whatever the date", async () => {
    const db = find();
    await listNotifiable("v1", "r1", "closure", now, db as never);
    expect(db.closureOutcome.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { venueId: "v1", dateRuleId: "r1", action: { not: "keep_silent" } },
      })
    );
  });
});
