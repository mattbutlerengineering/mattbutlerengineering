import { createHmac } from "crypto";
import { getManageTokenConfig } from "../config/manage-token.js";
import { secureCompareHex } from "../routes/public-reservations.js";

const TOKEN_SECRET = getManageTokenConfig({
  nodeEnv: process.env.NODE_ENV,
  secret: process.env.MANAGE_TOKEN_SECRET,
}).secret;

/** A guest's place in line is only worth reading for the evening they joined. */
export const WAITLIST_STATUS_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function sign(entryId: string, venueId: string, expiry: string): string {
  return createHmac("sha256", TOKEN_SECRET)
    .update(`waitlist:${entryId}:${venueId}:${expiry}`)
    .digest("hex");
}

/**
 * Capability for reading ONE waitlist entry's live status, minted at join.
 * The entry id is a guessable cuid (see public-holds.ts, #4487), so it is never
 * the credential; the HMAC binds entry, venue and expiry together.
 */
export function generateWaitlistStatusToken(
  entryId: string,
  venueId: string,
  now: number = Date.now()
): string {
  const expiry = String(now + WAITLIST_STATUS_TOKEN_TTL_MS);
  return Buffer.from(`${entryId}:${expiry}:${sign(entryId, venueId, expiry)}`).toString(
    "base64url"
  );
}

export function verifyWaitlistStatusToken(
  token: string,
  venueId: string,
  now: number = Date.now()
): { valid: false } | { valid: true; entryId: string } {
  const parts = Buffer.from(token, "base64url").toString().split(":");
  if (parts.length !== 3) return { valid: false };
  const [entryId, expiry, signature] = parts as [string, string, string];

  if (!secureCompareHex(signature, sign(entryId, venueId, expiry))) return { valid: false };
  if (!(Number(expiry) > now)) return { valid: false };
  return { valid: true, entryId };
}
