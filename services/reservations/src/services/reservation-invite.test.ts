import { describe, it, expect, vi, beforeEach } from "vitest";

const { rows, reservation } = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  reservation: { current: null as Record<string, unknown> | null },
}));

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      reservation: { findFirst: vi.fn(async () => reservation.current) },
      reservationInvite: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const hit = rows.find(
            (r) =>
              (where.reservationId === undefined || r.reservationId === where.reservationId) &&
              (where.tokenHash === undefined || r.tokenHash === where.tokenHash) &&
              (where.revokedAt !== null || r.revokedAt === null)
          );
          return hit ? { ...hit } : null;
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `inv-${rows.length + 1}`, revokedAt: null, ...data };
          rows.push(row);
          return { ...row };
        }),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: Record<string, unknown>;
            data: Record<string, unknown>;
          }) => {
            let count = 0;
            for (const r of rows) {
              if (r.reservationId === where.reservationId && r.revokedAt === null) {
                Object.assign(r, data);
                count += 1;
              }
            }
            return { count };
          }
        ),
      },
    },
  });
});

import {
  createInvite,
  findLiveInviteByToken,
  revokeInvitesForReservation,
  hashInviteToken,
  getInvitePublicView,
} from "./reservation-invite.js";

beforeEach(() => {
  rows.length = 0;
  reservation.current = {
    startTime: new Date("2026-07-10T22:00:00Z"),
    endTime: new Date("2026-07-10T23:30:00Z"),
    partySize: 4,
    status: "CONFIRMED",
    guestEmail: "jane@example.com",
    venue: { name: "The Oak Table", slug: "oak", ianaTimezone: "America/New_York" },
  };
});

describe("reservation invite", () => {
  it("issues a token of >=128 bits and stores only its hash", async () => {
    const { token } = await createInvite({ venueId: "v1", reservationId: "r1" });
    const secret = token.slice(token.indexOf(".") + 1);
    expect(Buffer.from(secret, "base64url").length).toBeGreaterThanOrEqual(16);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(rows[0])).not.toContain(secret);
  });

  it("does not use the manage-token shape (no email, no signature)", async () => {
    const { token } = await createInvite({ venueId: "v1", reservationId: "r1" });
    expect(token).not.toContain("@");
    expect(token).not.toContain(":");
  });

  it("finds a live invite by token, and rejects a wrong token", async () => {
    const { token } = await createInvite({ venueId: "v1", reservationId: "r1" });
    const found = await findLiveInviteByToken(token);
    expect(found).toMatchObject({ reservationId: "r1", venueId: "v1" });
    expect(await findLiveInviteByToken(`${token}x`)).toBeNull();
    expect(await findLiveInviteByToken("garbage")).toBeNull();
  });

  it("revokes invites for a cancelled reservation", async () => {
    const { token } = await createInvite({ venueId: "v1", reservationId: "r1" });
    await revokeInvitesForReservation({ venueId: "v1", reservationId: "r1" });
    expect(rows[0]!.revokedAt).toBeInstanceOf(Date);
    expect(await findLiveInviteByToken(token)).toBeNull();
  });

  describe("getInvitePublicView", () => {
    const now = new Date("2026-07-10T20:00:00Z");

    it("returns the allow-listed view in the venue's local date and time", async () => {
      const { token } = await createInvite({ venueId: "v1", reservationId: "r1" });
      expect(await getInvitePublicView(token, now)).toEqual({
        kind: "ok",
        view: {
          venue: { name: "The Oak Table", slug: "oak" },
          date: "2026-07-10",
          time: "18:00",
          partySize: 4,
          rsvps: [],
          status: "CONFIRMED",
        },
      });
    });

    it("is missing for unknown or malformed tokens", async () => {
      expect(await getInvitePublicView("v1.nope", now)).toEqual({ kind: "missing" });
      expect(await getInvitePublicView("garbage", now)).toEqual({ kind: "missing" });
    });

    it("is gone once revoked, cancelled or past", async () => {
      const { token } = await createInvite({ venueId: "v1", reservationId: "r1" });
      expect((await getInvitePublicView(token, new Date("2026-07-11T00:00:00Z"))).kind).toBe(
        "gone"
      );
      reservation.current!.status = "CANCELLED";
      expect((await getInvitePublicView(token, now)).kind).toBe("gone");
      reservation.current!.status = "CONFIRMED";
      await revokeInvitesForReservation({ venueId: "v1", reservationId: "r1" });
      expect((await getInvitePublicView(token, now)).kind).toBe("gone");
    });
  });
});
