import { describe, it, expect, vi, beforeEach } from "vitest";

const { rows } = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
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
} from "./reservation-invite.js";

beforeEach(() => {
  rows.length = 0;
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
});
