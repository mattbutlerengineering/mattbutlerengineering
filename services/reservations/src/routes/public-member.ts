import type { FastifyRequest } from "fastify";
import { verifyMemberToken } from "../services/member-token.js";

/** The Regulars Club member link the booking widget sends on availability, hold and confirm calls. */
const MEMBER_TOKEN_HEADER = "x-member-token";

/**
 * The member a request's `x-member-token` verifies to at this venue (#9625), or `null`.
 * Missing, invalid, expired, revoked and other-venue tokens all read as `null`, so the caller
 * serves the public window and the response never says whether an email is a member.
 */
export async function verifiedMember(
  request: FastifyRequest,
  venueId: string
): Promise<{ email: string } | null> {
  const token = request.headers[MEMBER_TOKEN_HEADER];
  if (typeof token !== "string" || token.length === 0) return null;
  const result = await verifyMemberToken(token);
  return result.valid && result.venueId === venueId ? { email: result.email } : null;
}
