import { createHmac, timingSafeEqual } from "crypto";
import type { FastifyPluginAsync } from "fastify";
import { guestService } from "../services/guest.js";

function getUnsubscribeSecret(): string {
  return process.env.UNSUBSCRIBE_SECRET ?? process.env.MANAGE_TOKEN_SECRET ?? "dev-secret-do-not-use";
}

/**
 * Verify an unsubscribe token produced by buildUnsubscribeToken().
 * Format: `<hmac-hex>.<guestId>`
 */
function verifyUnsubscribeToken(token: string): { valid: true; guestId: string } | { valid: false } {
  const dotIdx = token.indexOf(".");
  if (dotIdx < 1) return { valid: false };

  const sig = token.slice(0, dotIdx);
  const guestId = token.slice(dotIdx + 1);

  if (!guestId) return { valid: false };

  const expected = createHmac("sha256", getUnsubscribeSecret()).update(guestId).digest("hex");

  try {
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length) return { valid: false };
    if (!timingSafeEqual(sigBuf, expBuf)) return { valid: false };
  } catch {
    return { valid: false };
  }

  return { valid: true, guestId };
}

export const publicUnsubscribeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { token?: string } }>(
    "/public/v1/guests/unsubscribe",
    async (request, reply) => {
      const { token } = request.query;

      if (!token) {
        return reply
          .code(400)
          .send({ type: "about:blank", title: "Missing Token", status: 400, detail: "token query param is required" });
      }

      const result = verifyUnsubscribeToken(token);

      if (!result.valid) {
        return reply
          .code(400)
          .send({ type: "about:blank", title: "Invalid Token", status: 400, detail: "Invalid or tampered token" });
      }

      await guestService.unsubscribe(result.guestId);

      return reply
        .code(200)
        .type("text/html")
        .send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Unsubscribed</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center">
  <h1>You&apos;ve been unsubscribed</h1>
  <p>You will no longer receive post-visit emails from us.</p>
</body>
</html>`);
    }
  );
};
