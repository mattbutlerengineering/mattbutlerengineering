import { describe, it, expect, vi, beforeEach } from "vitest";

const { rows } = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      guestMembership: {
        upsert: vi.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { venueId_guestId: { venueId: string; guestId: string } };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const key = where.venueId_guestId;
            const hit = rows.find((r) => r.venueId === key.venueId && r.guestId === key.guestId);
            if (hit) {
              Object.assign(hit, update);
              return { ...hit };
            }
            const row = {
              id: `gm-${rows.length + 1}`,
              tier: "REGULAR",
              status: "ACTIVE",
              revokedAt: null,
              ...create,
            };
            rows.push(row);
            return { ...row };
          }
        ),
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
          rows
            .filter(
              (r) =>
                r.venueId === where.venueId &&
                (where.status === undefined || r.status === where.status)
            )
            .map((r) => ({ ...r }))
        ),
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
              if (
                r.venueId === where.venueId &&
                r.guestId === where.guestId &&
                r.status === where.status
              ) {
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

import { inviteMember, listMembers, revokeMember } from "./guest-membership.js";

describe("guest membership", () => {
  beforeEach(() => {
    rows.length = 0;
  });

  it("invites a guest as an ACTIVE regular, once per (venue, guest)", async () => {
    const a = await inviteMember({ venueId: "v1", guestId: "g1" });
    const b = await inviteMember({ venueId: "v1", guestId: "g1" });

    expect(a.status).toBe("ACTIVE");
    expect(a.tier).toBe("REGULAR");
    expect(b.id).toBe(a.id);
    expect(rows).toHaveLength(1);
  });

  it("lists only the venue's own members", async () => {
    await inviteMember({ venueId: "v1", guestId: "g1" });
    await inviteMember({ venueId: "v2", guestId: "g2" });

    const list = await listMembers({ venueId: "v1" });

    expect(list.map((m) => m.guestId)).toEqual(["g1"]);
  });

  it("revokes an active member and stamps revokedAt", async () => {
    await inviteMember({ venueId: "v1", guestId: "g1" });

    const revoked = await revokeMember({ venueId: "v1", guestId: "g1" });

    expect(revoked).toBe(true);
    expect(rows[0]?.status).toBe("REVOKED");
    expect(rows[0]?.revokedAt).toBeInstanceOf(Date);
  });

  it("revoking an unknown or already-revoked member is a no-op that reports false", async () => {
    expect(await revokeMember({ venueId: "v1", guestId: "nope" })).toBe(false);
    await inviteMember({ venueId: "v1", guestId: "g1" });
    await revokeMember({ venueId: "v1", guestId: "g1" });
    expect(await revokeMember({ venueId: "v1", guestId: "g1" })).toBe(false);
  });

  it("re-inviting a revoked member reactivates them and clears revokedAt", async () => {
    await inviteMember({ venueId: "v1", guestId: "g1" });
    await revokeMember({ venueId: "v1", guestId: "g1" });

    const again = await inviteMember({ venueId: "v1", guestId: "g1" });

    expect(again.status).toBe("ACTIVE");
    expect(again.revokedAt).toBeNull();
  });
});
