import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Guest } from "@mbe/types";

vi.mock("./guest.js", () => ({
  guestService: {
    getById: vi.fn(),
    findByEmail: vi.fn(),
    findByPhone: vi.fn(),
    create: vi.fn(),
    findOrCreate: vi.fn(),
    update: vi.fn(),
  },
}));

import { resolveGuestLink } from "./guest-link.js";
import { guestService } from "./guest.js";

const VENUE = "venue-1";

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "gst_1",
    venueId: VENUE,
    email: "ada@example.com",
    phone: "+15550001",
    name: "Ada",
    notes: null,
    visitCount: 3,
    noShowCount: 0,
    riskScore: "low",
    lifetimeSpend: null,
    lastVisit: null,
    tags: null,
    dietaryRestrictions: null,
    communicationPreference: "email",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Guest;
}

const mocked = () => ({
  getById: vi.mocked(guestService.getById),
  findByEmail: vi.mocked(guestService.findByEmail),
  findByPhone: vi.mocked(guestService.findByPhone),
  create: vi.mocked(guestService.create),
  findOrCreate: vi.mocked(guestService.findOrCreate),
  update: vi.mocked(guestService.update),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveGuestLink (booking-guest-reuse M1.3)", () => {
  it("(a) accepts a supplied id that belongs to the venue and skips the contact lookups", async () => {
    const m = mocked();
    m.getById.mockResolvedValueOnce(makeGuest({ id: "gst_1", venueId: VENUE }));

    const result = await resolveGuestLink({
      venueId: VENUE,
      guestId: "gst_1",
      guestEmail: "ada@example.com",
      guestPhone: "+15550001",
    });

    expect(result).toEqual({ ok: true, guestId: "gst_1" });
    expect(m.getById).toHaveBeenCalledWith("gst_1");
    expect(m.findByEmail).not.toHaveBeenCalled();
    expect(m.findByPhone).not.toHaveBeenCalled();
  });

  it("(b) rejects an unknown id and a foreign-venue id with the same GUEST_NOT_IN_VENUE object", async () => {
    const m = mocked();
    m.getById.mockResolvedValueOnce(null);
    const unknown = await resolveGuestLink({ venueId: VENUE, guestId: "gst_missing" });

    m.getById.mockResolvedValueOnce(makeGuest({ id: "gst_2", venueId: "venue-other" }));
    const foreign = await resolveGuestLink({ venueId: VENUE, guestId: "gst_2" });

    expect(unknown).toEqual({ ok: false, code: "GUEST_NOT_IN_VENUE" });
    expect(foreign).toEqual({ ok: false, code: "GUEST_NOT_IN_VENUE" });
    expect(foreign).toBe(unknown);
    expect(m.findByEmail).not.toHaveBeenCalled();
    expect(m.findByPhone).not.toHaveBeenCalled();
  });

  it("(c) email wins over phone when both match different guests, and both lookups ran", async () => {
    const m = mocked();
    m.findByEmail.mockResolvedValueOnce(makeGuest({ id: "gst_email" }));
    m.findByPhone.mockResolvedValueOnce(makeGuest({ id: "gst_phone" }));

    const result = await resolveGuestLink({
      venueId: VENUE,
      guestEmail: "ada@example.com",
      guestPhone: "+15550001",
    });

    expect(result).toEqual({ ok: true, guestId: "gst_email" });
    expect(m.findByEmail).toHaveBeenCalledWith(VENUE, "ada@example.com");
    expect(m.findByPhone).toHaveBeenCalledWith(VENUE, "+15550001");
    expect(m.getById).not.toHaveBeenCalled();
  });

  it("(d) falls back to the phone match when only the phone hits", async () => {
    const m = mocked();
    m.findByEmail.mockResolvedValueOnce(null);
    m.findByPhone.mockResolvedValueOnce(makeGuest({ id: "gst_phone" }));

    const result = await resolveGuestLink({
      venueId: VENUE,
      guestEmail: "nobody@example.com",
      guestPhone: "+15550001",
    });

    expect(result).toEqual({ ok: true, guestId: "gst_phone" });
  });

  it("(e) answers { ok: true, guestId: null } when neither contact matches", async () => {
    const m = mocked();
    m.findByEmail.mockResolvedValueOnce(null);
    m.findByPhone.mockResolvedValueOnce(null);

    const result = await resolveGuestLink({
      venueId: VENUE,
      guestEmail: "nobody@example.com",
      guestPhone: "+15559999",
    });

    expect(result).toEqual({ ok: true, guestId: null });
  });

  it("(f) answers { ok: true, guestId: null } with zero guestService calls when nothing is supplied", async () => {
    const m = mocked();

    const result = await resolveGuestLink({ venueId: VENUE });

    expect(result).toEqual({ ok: true, guestId: null });
    expect(m.getById).not.toHaveBeenCalled();
    expect(m.findByEmail).not.toHaveBeenCalled();
    expect(m.findByPhone).not.toHaveBeenCalled();
  });

  it("runs only the lookup whose input is present (phone-only input never calls findByEmail)", async () => {
    const m = mocked();
    m.findByPhone.mockResolvedValueOnce(null);

    await resolveGuestLink({ venueId: VENUE, guestPhone: "+15550001" });

    expect(m.findByEmail).not.toHaveBeenCalled();
    expect(m.findByPhone).toHaveBeenCalledTimes(1);
  });

  it("(g) never calls findOrCreate, update or create", async () => {
    const m = mocked();
    m.getById.mockResolvedValueOnce(makeGuest());
    m.findByEmail.mockResolvedValue(null);
    m.findByPhone.mockResolvedValue(null);

    await resolveGuestLink({ venueId: VENUE, guestId: "gst_1" });
    await resolveGuestLink({ venueId: VENUE, guestEmail: "a@b.c", guestPhone: "+1" });
    await resolveGuestLink({ venueId: VENUE });

    expect(m.findOrCreate).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("(h) propagates a rejected findByEmail without catching it", async () => {
    const m = mocked();
    const boom = new Error("db down");
    m.findByEmail.mockRejectedValueOnce(boom);
    m.findByPhone.mockResolvedValueOnce(null);

    await expect(
      resolveGuestLink({ venueId: VENUE, guestEmail: "a@b.c", guestPhone: "+1" })
    ).rejects.toBe(boom);
  });
});
