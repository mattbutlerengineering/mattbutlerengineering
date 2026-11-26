import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";
import { createAccessTokenService, TooManyAccessTokensError } from "./access-token.js";

type Row = {
  id: string;
  userSub: string;
  name: string;
  tokenHash: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  canWrite: boolean;
};

const NOW = new Date("2026-11-25T12:00:00.000Z");

function fakeClient(rows: Row[] = []) {
  const state = { rows: [...rows], seq: 0 };
  const personalAccessToken = {
    count: vi.fn(
      async ({ where }: { where: { userSub: string } }) =>
        state.rows.filter(
          (r) =>
            r.userSub === where.userSub &&
            r.revokedAt === null &&
            (r.expiresAt === null || r.expiresAt > NOW)
        ).length
    ),
    create: vi.fn(
      async ({
        data,
      }: {
        data: Omit<
          Row,
          "id" | "createdAt" | "lastUsedAt" | "revokedAt" | "expiresAt" | "canWrite"
        > & {
          expiresAt?: Date | null;
          canWrite?: boolean;
        };
      }) => {
        const row: Row = {
          id: `tok-${++state.seq}`,
          createdAt: NOW,
          lastUsedAt: null,
          revokedAt: null,
          expiresAt: null,
          canWrite: false,
          ...data,
        };
        state.rows.push(row);
        return { ...row };
      }
    ),
    findMany: vi.fn(async ({ where }: { where: { userSub: string } }) =>
      state.rows
        .filter((r) => r.userSub === where.userSub && r.revokedAt === null)
        .map((r) => ({ ...r }))
    ),
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const hit = state.rows.find((r) => r.tokenHash === where.tokenHash);
      return hit ? { ...hit } : null;
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: {
          id: string;
          userSub?: string;
          revokedAt?: null;
          OR?: { lastUsedAt: Date | null | { lt: Date } }[];
        };
        data: { revokedAt?: Date; lastUsedAt?: Date };
      }) => {
        const hit = state.rows.filter(
          (r) =>
            r.id === where.id &&
            (where.userSub === undefined || r.userSub === where.userSub) &&
            (where.revokedAt === undefined || r.revokedAt === null) &&
            (where.OR === undefined ||
              where.OR.some((c) =>
                c.lastUsedAt === null
                  ? r.lastUsedAt === null
                  : c.lastUsedAt instanceof Date
                    ? false
                    : r.lastUsedAt !== null && r.lastUsedAt < (c.lastUsedAt as { lt: Date }).lt
              ))
        );
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }
    ),
  };
  return { client: { personalAccessToken } as unknown as PrismaClient, state, personalAccessToken };
}

const row = (over: Partial<Row>): Row => ({
  id: "x",
  userSub: "auth0|a",
  name: "n",
  tokenHash: "h",
  prefix: "mbe_pat_xxxx",
  createdAt: NOW,
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  canWrite: false,
  ...over,
});

describe("accessTokenService.mint", () => {
  it("returns the plaintext once and stores only its SHA-256 hash", async () => {
    const { client, state } = fakeClient();
    const minted = await createAccessTokenService(client, () => NOW).mint("auth0|a", {
      name: "Claude Desktop",
    });

    expect(minted.token).toMatch(/^mbe_pat_[A-Za-z0-9_-]{43,}$/);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]?.tokenHash).toBe(createHash("sha256").update(minted.token).digest("hex"));
    expect(JSON.stringify(state.rows[0])).not.toContain(minted.token);
    expect(minted).toMatchObject({ name: "Claude Desktop", expiresAt: null, lastUsedAt: null });
    expect(minted.token.startsWith(minted.prefix)).toBe(true);
    expect(minted).not.toHaveProperty("tokenHash");
  });

  it("sets expiresAt from expiresInDays", async () => {
    const { client } = fakeClient();
    const minted = await createAccessTokenService(client, () => NOW).mint("auth0|a", {
      name: "short",
      expiresInDays: 30,
    });
    expect(minted.expiresAt).toBe("2026-12-25T12:00:00.000Z");
  });

  it("mints a read-only token unless write is asked for (#9778)", async () => {
    const { client, state } = fakeClient();
    const svc = createAccessTokenService(client, () => NOW);
    const readOnly = await svc.mint("auth0|a", { name: "r" });
    const writer = await svc.mint("auth0|a", { name: "w", write: true });

    expect(state.rows.map((r) => r.canWrite)).toEqual([false, true]);
    expect(readOnly.write).toBe(false);
    expect(writer.write).toBe(true);
  });

  it("mints a different token each time", async () => {
    const { client } = fakeClient();
    const svc = createAccessTokenService(client, () => NOW);
    const a = await svc.mint("auth0|a", { name: "a" });
    const b = await svc.mint("auth0|a", { name: "b" });
    expect(a.token).not.toBe(b.token);
  });

  it("refuses an eleventh active token", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ id: `t${i}` }));
    const { client, personalAccessToken } = fakeClient(rows);
    await expect(
      createAccessTokenService(client, () => NOW).mint("auth0|a", { name: "one too many" })
    ).rejects.toBeInstanceOf(TooManyAccessTokensError);
    expect(personalAccessToken.create).not.toHaveBeenCalled();
  });

  it("does not count revoked or expired tokens toward the cap", async () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => row({ id: `t${i}` })),
      row({ id: "r", revokedAt: NOW }),
      row({ id: "e", expiresAt: new Date("2026-01-01T00:00:00.000Z") }),
    ];
    const { client } = fakeClient(rows);
    await expect(
      createAccessTokenService(client, () => NOW).mint("auth0|a", { name: "fits" })
    ).resolves.toBeTruthy();
  });

  it("does not count another user's tokens", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ id: `t${i}`, userSub: "auth0|b" }));
    const { client } = fakeClient(rows);
    await expect(
      createAccessTokenService(client, () => NOW).mint("auth0|a", { name: "mine" })
    ).resolves.toBeTruthy();
  });
});

describe("accessTokenService.list", () => {
  it("lists the caller's unrevoked tokens without hash or plaintext", async () => {
    const { client } = fakeClient([
      row({ id: "mine", tokenHash: "secret-hash" }),
      row({ id: "gone", revokedAt: NOW }),
      row({ id: "theirs", userSub: "auth0|b" }),
    ]);
    const list = await createAccessTokenService(client, () => NOW).list("auth0|a");

    expect(list.map((t) => t.id)).toEqual(["mine"]);
    expect(list[0]?.write).toBe(false);
    expect(JSON.stringify(list)).not.toContain("secret-hash");
    expect(list[0]).not.toHaveProperty("tokenHash");
    expect(list[0]).not.toHaveProperty("token");
  });
});

describe("accessTokenService.revoke", () => {
  it("sets revokedAt on the caller's token", async () => {
    const { client, state } = fakeClient([row({ id: "mine" })]);
    await expect(
      createAccessTokenService(client, () => NOW).revoke("auth0|a", "mine")
    ).resolves.toBe(true);
    expect(state.rows[0]?.revokedAt).toEqual(NOW);
  });

  it("answers false for another user's token and leaves it untouched", async () => {
    const { client, state } = fakeClient([row({ id: "theirs", userSub: "auth0|b" })]);
    await expect(
      createAccessTokenService(client, () => NOW).revoke("auth0|a", "theirs")
    ).resolves.toBe(false);
    expect(state.rows[0]?.revokedAt).toBeNull();
  });

  it("answers false for an unknown or already revoked token", async () => {
    const { client } = fakeClient([row({ id: "old", revokedAt: NOW })]);
    const svc = createAccessTokenService(client, () => NOW);
    await expect(svc.revoke("auth0|a", "old")).resolves.toBe(false);
    await expect(svc.revoke("auth0|a", "nope")).resolves.toBe(false);
  });
});

describe("accessTokenService.authenticate", () => {
  const mintOne = async (client: PrismaClient, at: Date, input = { name: "n" } as never) =>
    createAccessTokenService(client, () => at).mint("auth0|a", input);

  it("resolves a live token to its user sub", async () => {
    const { client } = fakeClient();
    const { token } = await mintOne(client, NOW);
    const found = await createAccessTokenService(client, () => NOW).authenticate(token);
    expect(found).toEqual({ id: "tok-1", userSub: "auth0|a", write: false });
  });

  it("resolves a write-scoped token with its write flag (#9778)", async () => {
    const { client } = fakeClient();
    const { token } = await mintOne(client, NOW, { name: "w", write: true } as never);
    const found = await createAccessTokenService(client, () => NOW).authenticate(token);
    expect(found).toEqual({ id: "tok-1", userSub: "auth0|a", write: true });
  });

  it("rejects unknown, revoked and expired tokens", async () => {
    const { client, state } = fakeClient();
    const svc = createAccessTokenService(client, () => NOW);
    const live = await mintOne(client, NOW);
    const expiring = await mintOne(client, NOW, { name: "e", expiresInDays: 1 } as never);
    expect(await svc.authenticate("mbe_pat_nope")).toBeNull();
    expect(await svc.authenticate("not-a-pat")).toBeNull();

    state.rows[0]!.revokedAt = NOW;
    expect(await svc.authenticate(live.token)).toBeNull();

    const later = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(
      await createAccessTokenService(client, () => later).authenticate(expiring.token)
    ).toBeNull();
  });

  it("stamps lastUsedAt at most once a minute", async () => {
    const { client, state, personalAccessToken } = fakeClient();
    const { token } = await mintOne(client, NOW);
    const at = (ms: number) => createAccessTokenService(client, () => new Date(NOW.getTime() + ms));

    await at(0).authenticate(token);
    expect(state.rows[0]?.lastUsedAt).toEqual(NOW);
    personalAccessToken.updateMany.mockClear();

    await at(30_000).authenticate(token);
    expect(state.rows[0]?.lastUsedAt).toEqual(NOW);

    await at(61_000).authenticate(token);
    expect(state.rows[0]?.lastUsedAt).toEqual(new Date(NOW.getTime() + 61_000));
  });
});
