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
        data: Omit<Row, "id" | "createdAt" | "lastUsedAt" | "revokedAt" | "expiresAt"> & {
          expiresAt?: Date | null;
        };
      }) => {
        const row: Row = {
          id: `tok-${++state.seq}`,
          createdAt: NOW,
          lastUsedAt: null,
          revokedAt: null,
          expiresAt: null,
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
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; userSub: string; revokedAt: null };
        data: { revokedAt: Date };
      }) => {
        const hit = state.rows.filter(
          (r) => r.id === where.id && r.userSub === where.userSub && r.revokedAt === null
        );
        hit.forEach((r) => (r.revokedAt = data.revokedAt));
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
