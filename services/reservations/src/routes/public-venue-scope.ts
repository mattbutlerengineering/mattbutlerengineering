import type {
  FastifyReply,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteHandlerMethod,
} from "fastify";
import { createProblemDetails } from "@mbe/types";
import { resolveVenueId } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";
import { VENUE_SCOPE } from "./venue-scope.js";

/**
 * The public-slug source for venue scope (sibling of `venueScoped`, ADR-026
 * §3.3 item 3). An unauthenticated route whose authority is the slug in its
 * URL: the venue is resolved ONCE through the SECURITY DEFINER
 * `app_resolve_venue_id`, an unknown slug answers 404, and the handler runs
 * inside `runWithVenueContext` for the resolved venue.
 *
 * Deny status is uniform (404, so a slug's existence is the only thing it
 * tells a caller, exactly as before). The 404 *bytes* are each route's own
 * contract, so `notFound` lets a route keep its title/detail, or return an
 * `AppError` (thrown here) where the route's error handler owns the body.
 *
 * Rate limiting stays on the route's own `config.rateLimit`; this wrapper
 * adds none (gotchas.md § Fastify / rate limiting).
 */

type Handler<RG extends RouteGenericInterface> = RouteHandlerMethod<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  RG
>;
type RequestOf<RG extends RouteGenericInterface> = Parameters<Handler<RG>>[0];
type ReplyOf<RG extends RouteGenericInterface> = Parameters<Handler<RG>>[1];

export interface PublicNotFound {
  readonly title: string;
  readonly detail: string;
}

export interface PublicVenueScopeSpec<RG extends RouteGenericInterface> {
  readonly slug: (request: RequestOf<RG>) => string;
  /** The route's own 404 body, or an error to throw; defaults to "Not Found". */
  readonly notFound?: (slug: string) => PublicNotFound | Error;
  /**
   * Checks that must answer before the slug is looked up (a per-IP cap, a
   * required capability header), so an unknown slug cannot mask them.
   *
   * To stop the request, send a reply AND return it (any truthy value works);
   * return nothing to continue. The return value is the signal: `reply.sent`
   * alone is not, because in Fastify 5 it is `raw.writableEnded`, which only
   * flips after every async onSend hook has run — so a `before` that sent but
   * returned nothing could fall through into the handler.
   */
  readonly before?: (request: RequestOf<RG>, reply: ReplyOf<RG>) => unknown;
}

export interface PublicVenueScope {
  readonly venueId: string;
  readonly slug: string;
}

export type PublicScopedHandler<RG extends RouteGenericInterface> = (
  request: RequestOf<RG>,
  reply: ReplyOf<RG>,
  scope: PublicVenueScope
) => ReturnType<Handler<RG>>;

const defaultNotFound = (slug: string): PublicNotFound => ({
  title: "Not Found",
  detail: `No venue found with slug '${slug}'.`,
});

export function publicVenueScoped<RG extends RouteGenericInterface = RouteGenericInterface>(
  spec: PublicVenueScopeSpec<RG>,
  handler: PublicScopedHandler<RG>
): Handler<RG> {
  const notFound = spec.notFound ?? defaultNotFound;

  async function scopedHandler(request: RequestOf<RG>, reply: FastifyReply): Promise<unknown> {
    // Only a real Promise is awaited: a FastifyReply is thenable, so awaiting
    // a returned reply would resolve to `undefined` and lose the stop signal.
    // An async `before` that returns its reply settles only once the response
    // has finished, so `reply.sent` covers that case.
    const outcome = spec.before?.(request, reply as ReplyOf<RG>);
    const stop = outcome instanceof Promise ? await outcome : outcome;
    if (stop || reply.sent) return reply;

    const slug = spec.slug(request);
    const venueId = await resolveVenueId("venue_slug", slug);
    if (!venueId) {
      const denied = notFound(slug);
      if (denied instanceof Error) throw denied;
      return reply.code(404).send(createProblemDetails(404, denied.title, denied.detail));
    }
    return runWithVenueContext(venueId, async () =>
      handler(request, reply as ReplyOf<RG>, { venueId, slug })
    );
  }

  Object.defineProperty(scopedHandler, VENUE_SCOPE, { value: "slug/public" });
  return scopedHandler as unknown as Handler<RG>;
}
