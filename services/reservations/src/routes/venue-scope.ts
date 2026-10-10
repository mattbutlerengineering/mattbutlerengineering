import type {
  FastifyReply,
  FastifyRequest,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteHandlerMethod,
} from "fastify";
import {
  hasPermission,
  requireOwnershipOrAdmin,
  requireVenueAccess,
  type AuthUser,
} from "@mbe/auth/fastify";
import { createProblemDetails, titleForStatus, type ProblemDetails } from "@mbe/types";
import { resolveVenueId, type EntityKind } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";
import { resolveCurrentUserEmail } from "./reservation-owner.js";

/**
 * Declare a route's venue scope once (docs/fixes/venue-scoped-routes/architecture.md).
 *
 * `venueScoped(spec, handler)` wraps a route handler so that, per request, the
 * venue is resolved ONCE, the ADR-020 access decision runs against it (the
 * existing `requireVenueAccess` / `requireOwnershipOrAdmin`, invoked, never
 * copied), and the optional entity `load` plus the handler run inside
 * `runWithVenueContext` (ADR-026 §4) — so every query, transition and
 * fire-and-forget effect the handler starts sees the venue it was authorized
 * for. Before this module those were two halves each route paired by hand
 * (`requireVenueAccess(..., resolver)` in the preHandler, `loadInVenueContext`
 * again in the handler), and nothing checked that they agreed.
 *
 * Order (test-pinned in venue-scope.test.ts): admin check → resolve → null
 * handling → `admitIdentity` → access decision → `runWithVenueContext(load →
 * handler)`. Owner access is the one exception to "decide before load": the
 * owner is a field of the loaded entity, so for owner routes the load runs
 * (inside the context) before the ownership decision — exactly what the
 * reservation owner guard did before.
 *
 * What callers must know that the signature does not say:
 * - `requireAuth` (and any rate-limit hook) stays in the route's own
 *   `preHandler`; this wrapper runs after it.
 * - A `resolve` source is for tables with no RLS policy (holds) or composites
 *   of `resolveVenueId`; it must never read an RLS table through the scoped
 *   client, which resolves `null` under FORCE.
 * - A second-entity integrity check (a body `floorPlanId` belonging to the
 *   same venue, #5008/#5042/#6079) stays in the handler for now.
 */

type Handler<RG extends RouteGenericInterface> = RouteHandlerMethod<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  RG
>;
type RequestOf<RG extends RouteGenericInterface> = Parameters<Handler<RG>>[0];
type ReplyOf<RG extends RouteGenericInterface> = Parameters<Handler<RG>>[1];

/** Where the request's venue comes from. */
export type VenueSource<RG extends RouteGenericInterface, E> =
  /** Reads `venueId` from the query string, body or route params. */
  | "query"
  | "body"
  | "params"
  /** The same, for a key not named `venueId` (e.g. venues' own `:id`). */
  | { readonly from: "query" | "body" | "params"; readonly field: string }
  /** The venue owning an entity, through the SECURITY DEFINER resolver. */
  | {
      readonly entity: EntityKind;
      readonly key: (request: RequestOf<RG>) => unknown;
      /**
       * Runs INSIDE the venue context; `null` answers 404 `notFound`. Must be a
       * read with no side effects: for owner access it runs before the
       * ownership decision, so a non-owner reaches it.
       */
      readonly load?: (key: string) => Promise<E | null>;
      /** 404 `detail`, today's exact text for that route. */
      readonly notFound: string;
    }
  /** Escape hatch for tables with no RLS policy, or composite resolution. */
  | {
      readonly resolve: (request: RequestOf<RG>) => Promise<string | null>;
      /** Names the source in the coverage registry's descriptor. */
      readonly label: string;
      readonly notFound: string;
    };

/** Who may enter, once the venue is known. */
export type VenueAccess<E> =
  /** Default: ADR-020 venue membership (`requireVenueAccess`). Admins pass. */
  | "member"
  /** RLS context only; relies on `requireAuth` in the route's preHandler. */
  | "authenticated"
  /** ADR-020 ownership: the verified email equals `owner(entity)`. Admins pass. */
  | { readonly owner: (entity: E) => string | null };

/** What the handler receives; built once per request, never mutated. */
export interface VenueScope<E> {
  readonly venueId: string;
  readonly entity: E;
  readonly isAdmin: boolean;
}

export interface VenueScopeSpec<RG extends RouteGenericInterface, E> {
  readonly venue: VenueSource<RG, E>;
  readonly access?: VenueAccess<E>;
}

export type ScopedHandler<RG extends RouteGenericInterface, E> = (
  request: RequestOf<RG>,
  reply: ReplyOf<RG>,
  scope: VenueScope<E>
) => ReturnType<Handler<RG>>;

/** Symbol carrying a wrapped handler's descriptor, read by the coverage registry. */
export const VENUE_SCOPE: unique symbol = Symbol.for("mbe.reservations.venueScope");

/**
 * The single place a caller identity can be confined to a resolved venue
 * (architecture.md § admitIdentity). Called once per scoped request, after
 * the venue resolves and before the access decision. Returns `null` to admit
 * or a problem to send. Today it admits everyone; the live-demo-venue work
 * adds its demo-identity branches here. Held on an object so tests can
 * observe the call order.
 */
export const venueScopeHooks = {
  admitIdentity(
    _user: AuthUser | undefined,
    _venueId: string,
    _method: string,
    _routeKey: string
  ): ProblemDetails | null {
    return null;
  },
};

/** The descriptor `venueScoped` stamped on `handler`, or `null` for any other function. */
export function venueScopeOf(handler: unknown): string | null {
  if (typeof handler !== "function") return null;
  const descriptor = (handler as { [VENUE_SCOPE]?: unknown })[VENUE_SCOPE];
  return typeof descriptor === "string" ? descriptor : null;
}

type DirectSource = { readonly from: "query" | "body" | "params"; readonly field: string };
type EntitySource<RG extends RouteGenericInterface, E> = Extract<
  VenueSource<RG, E>,
  { readonly entity: EntityKind }
>;
type ResolveSource<RG extends RouteGenericInterface, E> = Extract<
  VenueSource<RG, E>,
  { readonly resolve: unknown }
>;

function directSource<RG extends RouteGenericInterface, E>(
  source: VenueSource<RG, E>
): DirectSource | null {
  if (typeof source === "string") return { from: source, field: "venueId" };
  return "from" in source ? source : null;
}

function isEntitySource<RG extends RouteGenericInterface, E>(
  source: VenueSource<RG, E>
): source is EntitySource<RG, E> {
  return typeof source === "object" && "entity" in source;
}

function describe<RG extends RouteGenericInterface, E>(
  source: VenueSource<RG, E>,
  access: VenueAccess<E>
): string {
  const direct = directSource(source);
  const from = direct
    ? `${direct.from}.${direct.field}`
    : isEntitySource(source)
      ? `entity:${source.entity}`
      : `resolve:${(source as ResolveSource<RG, E>).label}`;
  return `${from}/${typeof access === "object" ? "owner" : access}`;
}

function readField(request: FastifyRequest, { from, field }: DirectSource): string | null {
  const container = request[from] as Record<string, unknown> | null | undefined;
  const value = container?.[field];
  // "" is no venue: treating it as one would skip the missing-key cell.
  return typeof value === "string" && value !== "" ? value : null;
}

function sendProblem(reply: FastifyReply, status: number, detail: string): FastifyReply {
  return reply.code(status).send(createProblemDetails(status, titleForStatus(status), detail));
}

export function venueScoped<
  RG extends RouteGenericInterface = RouteGenericInterface,
  E = undefined,
>(spec: VenueScopeSpec<RG, E>, handler: ScopedHandler<RG, E>): Handler<RG> {
  const source = spec.venue;
  const access: VenueAccess<E> = spec.access ?? "member";
  const ownerAccess = typeof access === "object" ? access : null;
  if (ownerAccess && !(isEntitySource(source) && source.load)) {
    throw new Error("venueScoped: owner access needs an entity source with load");
  }
  const direct = directSource(source);
  const notFound = direct ? null : (source as EntitySource<RG, E> | ResolveSource<RG, E>).notFound;

  /** Today's ADR-020 guards, applied to the venue already resolved here. */
  async function decide(
    request: FastifyRequest,
    reply: FastifyReply,
    venueId: string | null,
    entity: E | null | undefined
  ): Promise<boolean> {
    if (ownerAccess) {
      await requireOwnershipOrAdmin(
        async () => (entity == null ? null : ownerAccess.owner(entity)),
        resolveCurrentUserEmail
      )(request, reply);
    } else {
      await requireVenueAccess(request.server.venueMembershipLookup, () => venueId)(request, reply);
    }
    return !reply.sent;
  }

  async function scopedHandler(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    const isAdmin = hasPermission(request.user, "admin");

    let venueId: string | null;
    let entityKey: string | null = null;
    if (direct) {
      venueId = readField(request, direct);
    } else if (isEntitySource(source)) {
      const key = source.key(request as RequestOf<RG>);
      entityKey = typeof key === "string" ? key : null;
      venueId = entityKey === null ? null : await resolveVenueId(source.entity, entityKey);
    } else {
      venueId = await (source as ResolveSource<RG, E>).resolve(request as RequestOf<RG>);
    }

    if (venueId === null) {
      // Admins and `authenticated` routes learn the honest answer; a
      // non-admin gets the guard's own 401/403, so existence never leaks.
      if (access === "authenticated" || isAdmin) {
        return direct
          ? sendProblem(reply, 400, `${direct.field} is required`)
          : sendProblem(reply, 404, notFound!);
      }
      await decide(request, reply, null, null);
      return reply;
    }

    const problem = venueScopeHooks.admitIdentity(
      request.user,
      venueId,
      request.method,
      `${request.method} ${request.routeOptions.url}`
    );
    if (problem) return reply.code(problem.status).send(problem);

    if (access === "member" && !(await decide(request, reply, venueId, null))) return reply;

    const resolvedVenueId = venueId;
    return runWithVenueContext(resolvedVenueId, async () => {
      let entity: E | null | undefined = undefined;
      if (isEntitySource(source) && source.load) {
        entity = await source.load(entityKey!);
        if (entity === null) return sendProblem(reply, 404, source.notFound);
      }
      if (ownerAccess && !(await decide(request, reply, resolvedVenueId, entity))) return reply;
      const scope: VenueScope<E> = { venueId: resolvedVenueId, entity: entity as E, isAdmin };
      return handler(request as RequestOf<RG>, reply as ReplyOf<RG>, scope);
    });
  }

  Object.defineProperty(scopedHandler, VENUE_SCOPE, { value: describe(source, access) });
  return scopedHandler as unknown as Handler<RG>;
}
