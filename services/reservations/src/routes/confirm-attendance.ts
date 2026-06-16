import type { FastifyPluginAsync } from "fastify";
import { verifyManageToken } from "./public-reservations.js";
import { reservationService } from "../services/reservation.js";

const successHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Attendance Confirmed</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa}
.card{text-align:center;padding:2rem;max-width:400px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
h1{color:#16a34a;margin:0 0 .5rem}p{color:#4b5563;margin:0}</style></head>
<body><div class="card"><h1>Attendance confirmed</h1><p>Thanks for confirming! We look forward to seeing you.</p></div></body>
</html>`;

const invalidHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invalid Link</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa}
.card{text-align:center;padding:2rem;max-width:400px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
h1{color:#dc2626;margin:0 0 .5rem}p{color:#4b5563;margin:0}</style></head>
<body><div class="card"><h1>Invalid Link</h1><p>This confirmation link is invalid or has already been used.</p></div></body>
</html>`;

const expiredHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link Expired</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa}
.card{text-align:center;padding:2rem;max-width:400px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
h1{color:#d97706;margin:0 0 .5rem}p{color:#4b5563;margin:0}</style></head>
<body><div class="card"><h1>Link Expired</h1><p>This confirmation link has expired. Please contact the venue for assistance.</p></div></body>
</html>`;

export const confirmAttendanceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.patch<{ Querystring: { token?: string } }>(
    "/public/v1/reservations/confirm",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const { token } = request.query;

      if (!token) {
        return reply.status(401).type("text/html").send(invalidHtml);
      }

      const result = verifyManageToken(token);

      if (!result.valid && result.expired) {
        return reply.status(410).type("text/html").send(expiredHtml);
      }

      if (!result.valid) {
        return reply.status(401).type("text/html").send(invalidHtml);
      }

      const reservation = await reservationService.getById(result.reservationId!);
      if (!reservation) {
        return reply.status(401).type("text/html").send(invalidHtml);
      }

      if (reservation.status === "PENDING") {
        await reservationService.update(result.reservationId!, { status: "CONFIRMED" });
      }

      return reply.status(200).type("text/html").send(successHtml);
    }
  );
};
