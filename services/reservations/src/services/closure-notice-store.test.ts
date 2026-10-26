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

const { loadRebookSlots } = await import("./closure-notice-store.js");

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
