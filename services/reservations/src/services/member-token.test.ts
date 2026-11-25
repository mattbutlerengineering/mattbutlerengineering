import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateManageToken } from "../routes/public-reservations.js";

const { memberships } = vi.hoisted(() => ({
  memberships: [] as Array<{ venueId: string; email: string; status: string }>,
}));

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      guestMembership: {
        findFirst: vi.fn(
          async ({
            where,
          }: {
            where: { venueId: string; status: string; guest: { email: string } };
          }) =>
            memberships.find(
              (m) =>
                m.venueId === where.venueId &&
                m.status === where.status &&
                m.email === where.guest.email
            ) ?? null
        ),
      },
    },
  });
});

import { generateMemberToken, verifyMemberToken, MEMBER_TOKEN_TTL_MS } from "./member-token.js";
import { verifyManageToken } from "../routes/public-reservations.js";

const NOW = new Date("2026-06-01T18:00:00Z").getTime();

describe("member token", () => {
  beforeEach(() => {
    memberships.length = 0;
    memberships.push({ venueId: "venue-1", email: "ana@example.com", status: "ACTIVE" });
  });

  it("verifies a valid token for an active member", async () => {
    const token = generateMemberToken("venue-1", "ana@example.com", NOW);
    expect(await verifyMemberToken(token, NOW + 1000)).toEqual({
      valid: true,
      venueId: "venue-1",
      email: "ana@example.com",
    });
  });

  it("normalizes email case", async () => {
    const token = generateMemberToken("venue-1", "Ana@Example.com", NOW);
    const result = await verifyMemberToken(token, NOW);
    expect(result).toMatchObject({ valid: true, email: "ana@example.com" });
  });

  it("rejects a tampered venue id as invalid (401)", async () => {
    const token = generateMemberToken("venue-1", "ana@example.com", NOW);
    const parts = Buffer.from(token, "base64url").toString().split(":");
    parts[0] = "venue-2";
    const forged = Buffer.from(parts.join(":")).toString("base64url");
    expect(await verifyMemberToken(forged, NOW)).toEqual({ valid: false, expired: false });
  });

  it("rejects a tampered email", async () => {
    const token = generateMemberToken("venue-1", "ana@example.com", NOW);
    const forged = Buffer.from(
      Buffer.from(token, "base64url").toString().replace("ana@", "eve@")
    ).toString("base64url");
    expect(await verifyMemberToken(forged, NOW)).toEqual({ valid: false, expired: false });
  });

  it("flags an expired token (410)", async () => {
    const token = generateMemberToken("venue-1", "ana@example.com", NOW);
    expect(await verifyMemberToken(token, NOW + MEMBER_TOKEN_TTL_MS + 1)).toEqual({
      valid: false,
      expired: true,
    });
  });

  it("rejects once the membership is revoked", async () => {
    const token = generateMemberToken("venue-1", "ana@example.com", NOW);
    memberships[0]!.status = "REVOKED";
    expect(await verifyMemberToken(token, NOW)).toEqual({ valid: false, expired: false });
  });

  it("rejects a valid signature for an email that was never a member (same answer as revoked)", async () => {
    const token = generateMemberToken("venue-1", "stranger@example.com", NOW);
    expect(await verifyMemberToken(token, NOW)).toEqual({ valid: false, expired: false });
  });

  it("does not accept a manage token as a member token", async () => {
    const manage = generateManageToken("venue-1", "ana@example.com");
    expect(await verifyMemberToken(manage, Date.now())).toEqual({ valid: false, expired: false });
  });

  it("does not accept a member token as a manage token", () => {
    const token = generateMemberToken("venue-1", "ana@example.com", Date.now());
    expect(verifyManageToken(token).valid).toBe(false);
  });

  it("rejects garbage without throwing", async () => {
    expect(await verifyMemberToken("not-a-token", NOW)).toEqual({ valid: false, expired: false });
    expect(await verifyMemberToken("", NOW)).toEqual({ valid: false, expired: false });
  });
});
