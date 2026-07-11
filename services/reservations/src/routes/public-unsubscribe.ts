import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails, titleForStatus, publicUnsubscribeQueryJsonSchema } from "@mbe/types";
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
        querystring: publicUnsubscribeQueryJsonSchema,
      },
    },
    async (request, reply) => {
      const { token } = request.query;

      if (!token) {
        return reply
          .status(400)
          .send(
            createProblemDetails(
              400,
              "Missing Token",
              "token query parameter is required",
              "about:blank",
              undefined,
              { code: "MISSING_TOKEN" }
            )
          );
      }

      const result = verifyUnsubscribeToken(token);
      if (!result.valid || !result.guestId) {
        return reply
          .status(400)
          .send(
            createProblemDetails(
              400,
              "Invalid Token",
              "Invalid or malformed unsubscribe token",
              "about:blank",
              undefined,
              { code: "INVALID_TOKEN" }
            )
          );
      }

      try {
        await guestService.markUnsubscribed(result.guestId);
      } catch (err) {
        request.log.error({ err }, "Failed to mark guest as unsubscribed");
        return reply
          .status(500)
          .send(
            createProblemDetails(500, titleForStatus(500), "Failed to process unsubscribe request")
          );
      }

      return reply
        .status(200)
        .header("Content-Type", "text/html; charset=utf-8")
        .send(renderConfirmationPage());
    }
  );
};
