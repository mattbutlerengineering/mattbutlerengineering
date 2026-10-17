import type { FastifyPluginAsync } from "fastify";
import { manageTokenScoped } from "./manage-token-scope.js";
import { guestActor } from "../services/reservation-events.js";

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

export const confirmAttendanceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.patch<{ Querystring: { token?: string } }>(
    "/public/v1/reservations/confirm",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    // ADR-026 §3.3 item 4: the scope verifies the token, resolves the venue
    // and loads the reservation once; the confirm runs inside that venue's
    // RLS context. A venue or reservation that is gone is this route's 401 page.
    manageTokenScoped(
      { missing: (reply) => reply.status(401).type("text/html").send(invalidHtml) },
      async (_request, reply, { reservation }) => {
        await fastify.transitions.confirmAttendance(reservation, guestActor(reservation.guestId));

        return reply.status(200).type("text/html").send(successHtml);
      }
    )
  );
};
