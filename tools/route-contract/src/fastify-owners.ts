/**
 * Fastify route-owner adapter.
 *
 * Boots the three real service apps and answers exactly one question per
 * owner: does this router match `METHOD url`? It translates and reports —
 * no ownership rules, no prefix logic, no knowledge of the client.
 *
 * `findRoute` is load-bearing and was measured against the alternatives:
 *
 * - `hasRoute` compares **pattern spelling**, not paths. Measured on
 *   `services/users`: `hasRoute({GET, "/api/v1/users/:id"})` is `true` while
 *   `hasRoute({GET, "/api/v1/users/<placeholder>"})` is `false`. Using it
 *   would mean normalizing `${id}` to `:id` across four prefix families by
 *   hand — re-implementing matching in a regex.
 * - Parsing `printRoutes()` is the same re-implementation, spelled worse.
 * - `app.inject()` would run handlers, reaching auth, Prisma and Redis for a
 *   question the router alone answers.
 *
 * Do not substitute any of them.
 */
import { buildApp as buildAgentApp } from "@mbe/agent-service/src/app.js";
import { buildApp as buildReservationsApp } from "@mbe/reservations-service/src/app.js";
import { buildApp as buildUsersApp } from "@mbe/users-service/src/app.js";

import type { HttpMethod } from "./types.js";

/** The three Fastify route owners. */
export const FASTIFY_OWNERS = ["reservations", "users", "agent"] as const;

export type FastifyOwner = (typeof FASTIFY_OWNERS)[number];

type App = Awaited<ReturnType<typeof buildUsersApp>>;

const BUILDERS: Readonly<Record<FastifyOwner, () => Promise<App>>> = {
  reservations: () => buildReservationsApp({ logger: false }),
  users: () => buildUsersApp({ logger: false }),
  agent: () => buildAgentApp({ logger: false }),
};

export interface FastifyOwnerTables {
  /** Does `owner`'s router match `METHOD url`? */
  answers(owner: FastifyOwner, method: HttpMethod, url: string): boolean;
  /** Every Fastify owner whose router matches, in {@link FASTIFY_OWNERS} order. */
  ownersOf(method: HttpMethod, url: string): FastifyOwner[];
  /**
   * Registered method+path entries for `owner`. Used only as the anti-vacuity
   * signal (a table that is empty can never fail the guard, so the guard has
   * to notice) — never for matching, which is always `findRoute`'s job.
   */
  routeCount(owner: FastifyOwner): number;
  close(): Promise<void>;
}

/**
 * Counts registered method+path entries in a `printRoutes()` tree.
 *
 * Each route node prints its methods as a parenthesised list, e.g.
 * `├── :id (GET, HEAD, PATCH, DELETE)` — four entries. Fastify's
 * auto-registered `HEAD`/`OPTIONS` are counted like any other, which is why
 * this number is larger than a count of distinct paths. Pure and exported so
 * the parse itself is testable without booting anything.
 */
export function countRegisteredRoutes(printedRoutes: string): number {
  let total = 0;
  for (const line of printedRoutes.split("\n")) {
    const methods = /\(([A-Z]+(?:, [A-Z]+)*)\)\s*$/.exec(line);
    if (methods?.[1]) total += methods[1].split(", ").length;
  }
  return total;
}

/**
 * Boots all three service apps and returns their route tables.
 *
 * Measured prerequisites, none of which need a database or a mock: Prisma
 * connects lazily and `findRoute` never enters a handler, so no query is ever
 * issued. `NODE_ENV` is pinned to `test` rather than inherited because
 * `services/reservations/src/app.ts:266` gates its `onReady` background work
 * — the lapsed-guest monitor and the in-process job worker, whose ioredis
 * connection retries forever against a Redis nothing started — on exactly
 * that value. Nothing in the three services' route *registration* reads
 * `NODE_ENV` (measured: its only other uses are CORS origins, the
 * fail-closed auth check, and those hooks), so the table this returns is the
 * table production registers.
 */
export async function bootFastifyOwners(): Promise<FastifyOwnerTables> {
  process.env.NODE_ENV = "test";

  const apps = {} as Record<FastifyOwner, App>;
  const counts = {} as Record<FastifyOwner, number>;

  for (const owner of FASTIFY_OWNERS) {
    const app = await BUILDERS[owner]();
    await app.ready();
    apps[owner] = app;
    counts[owner] = countRegisteredRoutes(app.printRoutes({ commonPrefix: false }));
  }

  const answers = (owner: FastifyOwner, method: HttpMethod, url: string): boolean =>
    apps[owner].findRoute({ method, url }) !== null;

  return {
    answers,
    ownersOf: (method, url) => FASTIFY_OWNERS.filter((owner) => answers(owner, method, url)),
    routeCount: (owner) => counts[owner],
    close: async () => {
      for (const owner of FASTIFY_OWNERS) await apps[owner].close();
    },
  };
}
