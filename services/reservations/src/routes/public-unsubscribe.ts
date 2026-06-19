import type { FastifyPluginAsync } from "fastify";
import { verifyUnsubscribeToken } from "../services/post-visit-notifier.js";
import { guestService } from "../services/guest.js";

/**
 * Unsubscribe confirmation page HTML — escapes all user-supplied values.
 * The guestId is never rendered in the response (only used to update the DB).
 */
function renderConfirmationPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unsubscribed</title>
  <style>
    body { font-family: sans-serif; max-width: 480px; margin: 80px auto; text-align: center; color: #333; }
    h1 { font-size: 1.5rem; }
    p { color: #666; }
  </style>
</head>
<body>
  <h1>You have been unsubscribed</h1>
  <p>You will no longer receive post-visit emails from us.</p>
</body>
</html>`;
}

export const publicUnsubscribeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { token?: string } }>(
    "/public/v1/guests/unsubscribe",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      schema: {
        summary: "Unsubscribe guest from post-visit emails",
        tags: ["Public"],
        querystring: {
          type: "object",
          properties: {
            token: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.query;

      if (!token) {
        return reply.status(400).send({
          type: "about:blank",
          title: "Missing Token",
          status: 400,
          detail: "token query parameter is required",
        });
      }

      const result = verifyUnsubscribeToken(token);
      if (!result.valid || !result.guestId) {
        return reply.status(400).send({
          type: "about:blank",
          title: "Invalid Token",
          status: 400,
          detail: "Invalid or malformed unsubscribe token",
        });
      }

      try {
        await guestService.markUnsubscribed(result.guestId);
      } catch (err) {
        request.log.error({ err }, "Failed to mark guest as unsubscribed");
        return reply.status(500).send({
          type: "about:blank",
          title: "Server Error",
          status: 500,
          detail: "Failed to process unsubscribe request",
        });
      }

      return reply
        .status(200)
        .header("Content-Type", "text/html; charset=utf-8")
        .send(renderConfirmationPage());
    }
  );
};
