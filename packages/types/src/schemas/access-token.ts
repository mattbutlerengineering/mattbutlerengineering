import { z } from "zod";

/** Mounted at this prefix by the reservations service (ADR-007 /api/v1 versioning). */
export const ACCESS_TOKENS_PREFIX = "/api/v1/me/tokens";

/** Longest a personal access token may live: one year (#9663). */
export const ACCESS_TOKEN_MAX_EXPIRY_DAYS = 365;

/** Most active tokens one user may hold at once (#9663). */
export const ACCESS_TOKEN_MAX_ACTIVE = 10;

/** `POST /api/v1/me/tokens`. */
export const CreateAccessTokenRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Days until the token stops working; omit for a token that does not expire. */
  expiresInDays: z.number().int().min(1).max(ACCESS_TOKEN_MAX_EXPIRY_DAYS).optional(),
  /** Opt in to the write scope (#9778); omitted or false mints a read-only token. */
  write: z.boolean().optional(),
});

/** One token as listed. The hash and the plaintext are never part of it. */
export const AccessTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The leading characters of the token, so a person can tell tokens apart. */
  prefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  /** True when the token may make the allowlisted changes; defaults for a pre-#9778 server. */
  write: z.boolean().default(false),
});

/** The mint response: the only time the plaintext token is ever returned. */
export const MintedAccessTokenSchema = AccessTokenSchema.extend({ token: z.string() });

export type CreateAccessTokenRequest = z.infer<typeof CreateAccessTokenRequestSchema>;
export type AccessToken = z.infer<typeof AccessTokenSchema>;
export type MintedAccessToken = z.infer<typeof MintedAccessTokenSchema>;
