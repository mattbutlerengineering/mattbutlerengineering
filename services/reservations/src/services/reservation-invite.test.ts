import { describe, it, expect, vi, beforeEach } from "vitest";

const { rows, rsvpRows, reservation } = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  rsvpRows: [] as Array<Record<string, unknown>>,
  reservation: { current: null as Record<string, unknown> | null },
}));

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      reservation: { findFirst: vi.fn(async () => reservation.current) },
      reservationRsvp: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
          rsvpRows.filter((r) => r.inviteId === where.inviteId).map((r) => ({ ...r }))
        ),
        count: vi.fn(
          async ({ where }: { where: Record<string, unknown> }) =>
            rsvpRows.filter((r) => r.inviteId === where.inviteId).length
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `rsvp-${rsvpRows.length + 1}`, createdAt: new Date(), ...data };
          rsvpRows.push(row);
          return { ...row };
        }),
      },
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
  addInviteRsvp,
} from "./reservation-invite.js";

beforeEach(() => {
  rows.length = 0;
  rsvpRows.length = 0;
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

  describe("addInviteRsvp", () => {
    const now = new Date("2026-07-10T20:00:00Z");

    it("stores a first-name-only RSVP and the public view reflects it", async () => {
      const { token } = await createInvite({ venueId: "v1", reservationId: "r1" });
      const res = await addInviteRsvp(token, { firstName: "Sam", status: "IN" }, now);
      expect(res).toEqual({ kind: "ok" });
      expect(rsvpRows).toHaveLength(1);
      expect(Object.keys(rsvpRows[0]!).sort()).toEqual(
        ["createdAt", "firstName", "id", "inviteId", "status", "venueId"].sort()
      );
      const view = await getInvitePublicView(token, now);
      expect(view.kind === "ok" && view.view.rsvps).toEqual([{ firstName: "Sam", status: "IN" }]);
    });

    it("caps RSVPs at partySize + 2", async () => {
      const { token } = await createInvite({ venueId: "v1", reservationId: "r1" });
      for (let i = 0; i < 6; i += 1) {
        expect(await addInviteRsvp(token, { firstName: `G${i}`, status: "IN" }, now)).toEqual({
          kind: "ok",
        });
      }
      expect(await addInviteRsvp(token, { firstName: "Late", status: "IN" }, now)).toEqual({
        kind: "full",
      });
      expect(rsvpRows).toHaveLength(6);
    });

    it("is missing for unknown tokens and gone when revoked, cancelled or past", async () => {
      expect(await addInviteRsvp("v1.nope", { firstName: "A", status: "IN" }, now)).toEqual({
        kind: "missing",
      });
      const { token } = await createInvite({ venueId: "v1", reservationId: "r1" });
      const later = new Date("2026-07-11T00:00:00Z");
      expect((await addInviteRsvp(token, { firstName: "A", status: "IN" }, later)).kind).toBe(
        "gone"
      );
      reservation.current!.status = "CANCELLED";
      expect((await addInviteRsvp(token, { firstName: "A", status: "IN" }, now)).kind).toBe("gone");
      expect(rsvpRows).toHaveLength(0);
    });
  });
});
