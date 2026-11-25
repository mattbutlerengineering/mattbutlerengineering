import { createHmac } from "crypto";
import { getManageTokenConfig } from "../config/manage-token.js";
import { secureCompareHex } from "../routes/public-reservations.js";
import { prisma } from "./database.js";
import { runWithVenueContext } from "./venue-context-store.js";

const TOKEN_SECRET = getManageTokenConfig({
  nodeEnv: process.env.NODE_ENV,
  secret: process.env.MANAGE_TOKEN_SECRET,
}).secret;

/** A member link is emailed once and reused for the season, so it outlives a manage link. */
export const MEMBER_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * The `member:` prefix is signed into the payload, so a manage token (signed over
 * `reservationId:email:expiry`) can never verify here, nor a member token there.
 */
function sign(venueId: string, email: string, expiry: string): string {
  return createHmac("sha256", TOKEN_SECRET)
    .update(`member:${venueId}:${email}:${expiry}`)
    .digest("hex");
}

/** Regulars Club signed member link (#9624). Carries venue id and email; bound to that email. */
export function generateMemberToken(
  venueId: string,
  email: string,
  now: number = Date.now()
): string {
  const normalized = email.trim().toLowerCase();
  const expiry = String(now + MEMBER_TOKEN_TTL_MS);
  return Buffer.from(
    `${venueId}:${expiry}:${normalized}:${sign(venueId, normalized, expiry)}`
  ).toString("base64url");
}

export type MemberTokenResult =
  { valid: true; venueId: string; email: string } | { valid: false; expired: boolean };

const INVALID: MemberTokenResult = { valid: false, expired: false };

/**
 * Verifies signature, expiry, then that the email still holds an ACTIVE membership at the venue.
 * Revoking the membership therefore kills every token issued for it. Unknown, never-invited and
 * revoked all return the same `INVALID`, so a caller cannot ask "is this email a member".
 * Callers map: missing token 400, `expired` 410, otherwise 401.
 */
export async function verifyMemberToken(
  token: string,
  now: number = Date.now()
): Promise<MemberTokenResult> {
  try {
    const parts = Buffer.from(token, "base64url").toString().split(":");
    if (parts.length < 4) return INVALID;
    const signature = parts.pop()!;
    const venueId = parts.shift()!;
    const expiryStr = parts.shift()!;
    // Whatever remains is the email, which may itself contain colons.
    const email = parts.join(":");

    if (!secureCompareHex(signature, sign(venueId, email, expiryStr))) return INVALID;
    if (now > Number(expiryStr)) return { valid: false, expired: true };

    const membership = await runWithVenueContext(venueId, () =>
      prisma.guestMembership.findFirst({
        where: { venueId, status: "ACTIVE", guest: { email } },
        select: { id: true },
      })
    );
    return membership ? { valid: true, venueId, email } : INVALID;
  } catch {
    return INVALID;
  }
}
