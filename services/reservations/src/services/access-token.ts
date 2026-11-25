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
