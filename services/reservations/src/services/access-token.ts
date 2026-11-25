import { createHash, randomBytes } from "node:crypto";
import {
  ACCESS_TOKEN_MAX_ACTIVE,
  type AccessToken,
  type CreateAccessTokenRequest,
  type MintedAccessToken,
} from "@mbe/types";
import type { PersonalAccessToken, PrismaClient } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

const TOKEN_PREFIX = "mbe_pat_";
const DISPLAY_PREFIX_LENGTH = TOKEN_PREFIX.length + 4;
const DAY_MS = 24 * 60 * 60 * 1000;
/** `lastUsedAt` is stamped at most this often, so a busy client is not a write per request. */
const LAST_USED_GRANULARITY_MS = 60 * 1000;

/** True when `value` has the shape of a personal access token (not a JWT). */
export const isAccessToken = (value: string): boolean => value.startsWith(TOKEN_PREFIX);

/** Raised when a user already holds the most active tokens allowed. */
export class TooManyAccessTokensError extends Error {
  constructor() {
    super(
      `You can hold at most ${ACCESS_TOKEN_MAX_ACTIVE} active access tokens. Revoke one first.`
    );
    this.name = "TooManyAccessTokensError";
  }
}

/** The one place a token is hashed,. */
const hashAccessToken = (token: string): string => createHash("sha256").update(token).digest("hex");

const toAccessToken = (row: PersonalAccessToken): AccessToken => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  createdAt: row.createdAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  expiresAt: row.expiresAt?.toISOString() ?? null,
});

export function createAccessTokenService(
  client: PrismaClient = prisma,
  now: () => Date = () => new Date()
) {
  return {
    /** Mints a token; the plaintext in the result is never retrievable again. */
    async mint(userSub: string, input: CreateAccessTokenRequest): Promise<MintedAccessToken> {
      const at = now();
      const active = await client.personalAccessToken.count({
        where: {
          userSub,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
        },
      });
      if (active >= ACCESS_TOKEN_MAX_ACTIVE) throw new TooManyAccessTokensError();

      const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
      const row = await client.personalAccessToken.create({
        data: {
          userSub,
          name: input.name,
          tokenHash: hashAccessToken(token),
          prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
          expiresAt: input.expiresInDays
            ? new Date(at.getTime() + input.expiresInDays * DAY_MS)
            : null,
        },
      });
      return { ...toAccessToken(row), token };
    },

    /** The caller's tokens that are not revoked, newest first. */
    async list(userSub: string): Promise<AccessToken[]> {
      const rows = await client.personalAccessToken.findMany({
        where: { userSub, revokedAt: null },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toAccessToken);
    },

    /**
     * Resolves a presented plaintext token to its owner, or `null` when it is
     * unknown, revoked or expired. Stamps `lastUsedAt` at most once a minute.
     */
    async authenticate(token: string): Promise<{ id: string; userSub: string } | null> {
      if (!isAccessToken(token)) return null;
      const row = await client.personalAccessToken.findUnique({
        where: { tokenHash: hashAccessToken(token) },
      });
      const at = now();
      if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= at)) return null;
      await client.personalAccessToken.updateMany({
        where: {
          id: row.id,
          OR: [
            { lastUsedAt: null },
            { lastUsedAt: { lt: new Date(at.getTime() - LAST_USED_GRANULARITY_MS) } },
          ],
        },
        data: { lastUsedAt: at },
      });
      return { id: row.id, userSub: row.userSub };
    },

    /** `false` when the token is unknown, not the caller's, or already revoked. */
    async revoke(userSub: string, id: string): Promise<boolean> {
      const { count } = await client.personalAccessToken.updateMany({
        where: { id, userSub, revokedAt: null },
        data: { revokedAt: now() },
      });
      return count > 0;
    },
  };
}

export const accessTokenService = createAccessTokenService();
