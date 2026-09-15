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

import { resolveGuestLink, linkOrCreateGuest } from "./guest-link.js";
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

describe("linkOrCreateGuest (booking-guest-reuse M1.4)", () => {
  it("returns a resolve hit unchanged and never calls create", async () => {
    const m = mocked();
    m.findByEmail.mockResolvedValueOnce(makeGuest({ id: "gst_hit" }));
    m.findByPhone.mockResolvedValueOnce(null);

    const result = await linkOrCreateGuest({
      venueId: VENUE,
      guestName: "Ada",
      guestEmail: "ada@example.com",
      guestPhone: "+15550001",
    });

    expect(result).toEqual({ ok: true, guestId: "gst_hit" });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("returns a GUEST_NOT_IN_VENUE rejection unchanged and never calls create", async () => {
    const m = mocked();
    m.getById.mockResolvedValueOnce(null);

    const result = await linkOrCreateGuest({ venueId: VENUE, guestId: "gst_x", guestName: "Ada" });

    expect(result).toEqual({ ok: false, code: "GUEST_NOT_IN_VENUE" });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("miss + email + name → create called once with { venueId, name, email } (no phone key) and its id returned", async () => {
    const m = mocked();
    m.findByEmail.mockResolvedValueOnce(null);
    m.create.mockResolvedValueOnce(makeGuest({ id: "gst_new" }));

    const result = await linkOrCreateGuest({
      venueId: VENUE,
      guestName: "Ada",
      guestEmail: "ada@example.com",
    });

    expect(result).toEqual({ ok: true, guestId: "gst_new" });
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.create).toHaveBeenCalledWith({
      venueId: VENUE,
      name: "Ada",
      email: "ada@example.com",
    });
    expect(m.create.mock.calls[0]![0]).not.toHaveProperty("phone");
  });

  it("miss + phone + name → create called with { venueId, name, phone } (no email key)", async () => {
    const m = mocked();
    m.findByPhone.mockResolvedValueOnce(null);
    m.create.mockResolvedValueOnce(makeGuest({ id: "gst_new" }));

    const result = await linkOrCreateGuest({
      venueId: VENUE,
      guestName: "Ada",
      guestPhone: "+15550001",
    });

    expect(result).toEqual({ ok: true, guestId: "gst_new" });
    expect(m.create).toHaveBeenCalledWith({ venueId: VENUE, name: "Ada", phone: "+15550001" });
    expect(m.create.mock.calls[0]![0]).not.toHaveProperty("email");
  });

  it("miss + name, no contact → { ok: true, guestId: null } and no create", async () => {
    const m = mocked();

    const result = await linkOrCreateGuest({ venueId: VENUE, guestName: "Ada" });

    expect(result).toEqual({ ok: true, guestId: null });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("miss + contact, no name → { ok: true, guestId: null } and no create", async () => {
    const m = mocked();
    m.findByEmail.mockResolvedValueOnce(null);

    const result = await linkOrCreateGuest({ venueId: VENUE, guestEmail: "ada@example.com" });

    expect(result).toEqual({ ok: true, guestId: null });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("create rejecting with P2002 → contact lookups run a second time and the winner's id is returned", async () => {
    const m = mocked();
    m.findByEmail
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeGuest({ id: "gst_winner" }));
    m.findByPhone.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    m.create.mockRejectedValueOnce({ code: "P2002" });

    const result = await linkOrCreateGuest({
      venueId: VENUE,
      guestName: "Ada",
      guestEmail: "ada@example.com",
      guestPhone: "+15550001",
    });

    expect(result).toEqual({ ok: true, guestId: "gst_winner" });
    expect(m.findByEmail).toHaveBeenCalledTimes(2);
    expect(m.findByPhone).toHaveBeenCalledTimes(2);
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it("create rejecting with any other error → the rejection propagates", async () => {
    const m = mocked();
    const boom = new Error("insert failed");
    m.findByEmail.mockResolvedValueOnce(null);
    m.create.mockRejectedValueOnce(boom);

    await expect(
      linkOrCreateGuest({ venueId: VENUE, guestName: "Ada", guestEmail: "ada@example.com" })
    ).rejects.toBe(boom);
    expect(m.findByEmail).toHaveBeenCalledTimes(1);
  });

  it("never calls findOrCreate or update", async () => {
    const m = mocked();
    m.findByEmail.mockResolvedValue(null);
    m.findByPhone.mockResolvedValue(null);
    m.create.mockResolvedValue(makeGuest({ id: "gst_new" }));

    await linkOrCreateGuest({
      venueId: VENUE,
      guestName: "Ada",
      guestEmail: "a@b.c",
      guestPhone: "+1",
    });
    await linkOrCreateGuest({ venueId: VENUE });

    expect(m.findOrCreate).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
});
