import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Reservation } from "@mbe/types";

const { getPolicyById, getById, findByEmail, findByPhone, assessGuestReliability } = vi.hoisted(
  () => ({
    getPolicyById: vi.fn(),
    getById: vi.fn(),
    findByEmail: vi.fn(),
    findByPhone: vi.fn(),
    assessGuestReliability: vi.fn(),
  })
);

vi.mock("./venue.js", () => ({ venueService: { getPolicyById, getById } }));
vi.mock("./guest.js", () => ({ guestService: { findByEmail, findByPhone } }));
vi.mock("./guest-reliability.js", () => ({ assessGuestReliability }));
vi.mock("./database.js", () => ({ prisma: {} }));

const { rebookRequiresDeposit } = await import("./manage-rebook-deps.js");

const reservation = {
  id: "res_1",
  guestEmail: "ana@example.com",
  guestPhone: "+15555550100",
} as unknown as Reservation;

describe("rebookRequiresDeposit (the closure rebook's money rule)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getById.mockResolvedValue({ settings: null });
    findByEmail.mockResolvedValue({ id: "g1" });
  });

  it("needs no deposit when no deposit amount is configured, even if enabled", async () => {
    getPolicyById.mockResolvedValue({ depositAmountCents: null, depositEnabled: true });
    await expect(rebookRequiresDeposit("v1", reservation)).resolves.toBe(false);
  });

  it("needs a deposit when the venue policy is enabled", async () => {
    getPolicyById.mockResolvedValue({ depositAmountCents: 2000, depositEnabled: true });
    await expect(rebookRequiresDeposit("v1", reservation)).resolves.toBe(true);
    expect(assessGuestReliability).not.toHaveBeenCalled();
  });

  it("needs a deposit for a risky guest when the policy is off", async () => {
    getPolicyById.mockResolvedValue({ depositAmountCents: 2000, depositEnabled: false });
    assessGuestReliability.mockReturnValue("risky");
    await expect(rebookRequiresDeposit("v1", reservation)).resolves.toBe(true);
    expect(findByEmail).toHaveBeenCalledWith("v1", "ana@example.com");
  });

  it("needs no deposit for a reliable guest when the policy is off", async () => {
    getPolicyById.mockResolvedValue({ depositAmountCents: 2000, depositEnabled: false });
    assessGuestReliability.mockReturnValue("reliable");
    await expect(rebookRequiresDeposit("v1", reservation)).resolves.toBe(false);
  });

  it("falls back to the phone when the reservation has no email", async () => {
    getPolicyById.mockResolvedValue({ depositAmountCents: 2000, depositEnabled: false });
    findByPhone.mockResolvedValue({ id: "g2" });
    assessGuestReliability.mockReturnValue("risky");
    const noEmail = { ...reservation, guestEmail: null } as unknown as Reservation;
    await expect(rebookRequiresDeposit("v1", noEmail)).resolves.toBe(true);
    expect(findByPhone).toHaveBeenCalledWith("v1", "+15555550100");
  });
});
