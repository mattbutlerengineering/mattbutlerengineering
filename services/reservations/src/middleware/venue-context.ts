import type { FastifyReply, FastifyRequest } from "fastify";
import type { VenueIdResolver } from "@mbe/auth/fastify";
import { prisma } from "../services/database.js";

/**
 * Postgres RLS venue-scoping backstop (ADR-026), part 5/7.
 *
 * Minimal shape needed to issue the `SET LOCAL` statement — any of the
 * top-level `PrismaClient` or a `Prisma.TransactionClient` — that exposes
 * tagged-template `$executeRaw`.
 */
export interface VenueContextClient {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
}

/**
 * Sets the `app.venue_id` Postgres session variable (ADR-026 §4) via a
 * parameterized `SET LOCAL`, using Prisma's tagged-template `$executeRaw` —
 * never raw string interpolation — so a venue id can never be used for SQL
 * injection.
 *
 * When `venueId` is `null`/`undefined`, this is a deliberate no-op:
 * `app.venue_id` stays unset, so every ADR-026 RLS policy's
 * `current_setting('app.venue_id', true)` evaluates to SQL `NULL`, which per
 * ADR-026 §4 is default-deny (zero rows visible or writable) — not an error
 * and not "every venue". This is the correct behavior for requests with no
 * resolved venue context (public routes, the platform-admin cross-venue
 * escape hatch, etc).
 *
 * Correctness note (ADR-026 §4): `SET LOCAL` is transaction-scoped in
 * Postgres. Callers that need the setting to hold for more than a single
 * statement MUST invoke this with a Prisma transaction client
 * (`Prisma.TransactionClient`) obtained from `prisma.$transaction(...)` —
 * passed the top-level `PrismaClient` singleton outside an explicit
 * transaction, `SET LOCAL` has no effect beyond that one implicit statement.
 * Wiring every request into such a transaction is app-bootstrap work
 * tracked by ADR-026 part 6 (not this issue) — this function, and
 * `venueContextPreHandler` below, are the primitives that work will consume.
 */
export async function setVenueContext(
  client: VenueContextClient,
  venueId: string | null | undefined
): Promise<void> {
  if (!venueId) return;
  await client.$executeRaw`SET LOCAL app.venue_id = ${venueId}`;
}

/**
 * Fastify preHandler factory (ADR-026 part 5). Resolves the request's venue
 * id the same way `requireVenueAccess` (ADR-020) routes already do — via a
 * `VenueIdResolver`, shared with `@mbe/auth/fastify` — and sets
 * `app.venue_id` for the request's database session.
 *
 * Unauthenticated/public routes (no venue context resolved yet, e.g.
 * `/public/v1/venues/:slug/*` before the slug is resolved) are handled by
 * simply not setting the session variable: `setVenueContext` no-ops on a
 * null/undefined venue id, which is the ADR-026 §4 default-deny behavior,
 * not an error.
 *
 * Not wired into any route yet — see this module's doc comment on
 * `setVenueContext` for why, and ADR-026 part 6 for the app-bootstrap wiring
 * (which must also supply the per-request transaction for the `SET LOCAL`
 * to be effective in production) that will consume this export.
 */
export function venueContextPreHandler(
  resolveVenueId: VenueIdResolver
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function setVenueContextPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const venueId = await resolveVenueId(request);
    await setVenueContext(prisma, typeof venueId === "string" ? venueId : null);
  };
}
