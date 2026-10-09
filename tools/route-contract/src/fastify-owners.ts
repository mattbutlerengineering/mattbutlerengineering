/**
 * Fastify route-owner adapter.
 *
 * Boots the three real service apps — each one twice, see
 * {@link bootFastifyOwners} — and answers exactly one question per owner: does
 * this router match `METHOD url`? It translates and reports — no ownership
 * rules, no prefix logic, no knowledge of the client.
 *
 * `findRoute` is load-bearing and was measured against the alternatives:
 *
 * - `hasRoute` compares **pattern spelling**, not paths. Measured on
 *   `services/users`: `hasRoute({GET, "/api/v1/users/:id"})` is `true` while
 *   `hasRoute({GET, "/api/v1/users/<placeholder>"})` is `false`. Using it
 *   would mean normalizing `${id}` to `:id` across four prefix families by
 *   hand — re-implementing matching in a regex.
 * - Parsing `printRoutes()` is the same re-implementation, spelled worse.
 *   (`printedRouteEntries` below does parse it — but only to *diff* two boots
 *   of the same app against each other, never to answer a match.)
 * - `app.inject()` would run handlers, reaching auth, Prisma and Redis for a
 *   question the router alone answers.
 *
 * Do not substitute any of them.
 */
import type { buildApp as buildUsersApp } from "@mbe/users-service/src/app.js";
import { vi } from "vitest";

import type { HttpMethod } from "./types.js";

/** The three Fastify route owners. */
export const FASTIFY_OWNERS = ["reservations", "users", "agent"] as const;

export type FastifyOwner = (typeof FASTIFY_OWNERS)[number];

type App = Awaited<ReturnType<typeof buildUsersApp>>;

/**
 * Each builder imports its service through {@link importFresh}, never
 * statically, so the service's module scope is evaluated under the boot's own
 * `NODE_ENV` — see {@link bootFastifyOwners}.
 */
const BUILDERS: Readonly<Record<FastifyOwner, () => Promise<App>>> = {
  reservations: async () =>
    (await importFresh(() => import("@mbe/reservations-service/src/app.js"))).buildApp({
      logger: false,
    }),
  users: async () =>
    (await importFresh(() => import("@mbe/users-service/src/app.js"))).buildApp({ logger: false }),
  agent: async () =>
    (await importFresh(() => import("@mbe/agent-service/src/app.js"))).buildApp({ logger: false }),
};

export interface FastifyOwnerTables {
  /**
   * Does `owner`'s router match `METHOD url` under BOTH boots? A route only
   * one of them registers is not an owner — see {@link bootFastifyOwners}.
   */
  answers(owner: FastifyOwner, method: HttpMethod, url: string): boolean;
  /** Every Fastify owner whose router matches, in {@link FASTIFY_OWNERS} order. */
  ownersOf(method: HttpMethod, url: string): FastifyOwner[];
  /**
   * Registered method+path entries in `owner`'s EFFECTIVE table — the entries
   * both boots register, i.e. the ones `answers` can say yes to. Used only as
   * the anti-vacuity signal (a table that is empty can never fail the guard,
   * so the guard has to notice) — never for matching, which is always
   * `findRoute`'s job.
   */
  routeCount(owner: FastifyOwner): number;
  /**
   * Registered entries in `owner`'s `NODE_ENV="test"` boot alone. Exposed only
   * so the difference between the two boots is assertable; the guard itself
   * never consults it.
   */
  testBootRouteCount(owner: FastifyOwner): number;
  /**
   * Every route the two boots disagree about, across all three owners, sorted
   * by owner then entry. Empty would mean no service gates a route on
   * `NODE_ENV` at all.
   */
  envConditionalRoutes(): EnvConditionalRoute[];
  /**
   * `owner`'s OpenAPI document from the `test` boot (`app.swagger()`), read
   * after `ready()`. The route side of schema parity: it is exactly the
   * artifact the "OpenAPI output unchanged" constraint protects, and Fastify's
   * `findRoute` exposes no route schema to read instead.
   */
  openApiDocument(owner: FastifyOwner): unknown;
  close(): Promise<void>;
}

/** A route one boot registers and the other does not. */
export interface EnvConditionalRoute {
  readonly owner: FastifyOwner;
  /** `METHOD /full/path`, exactly as `printRoutes` spells the registration. */
  readonly entry: string;
  /** The boot that registered it. The other one did not. */
  readonly registeredUnder: "test" | "production";
}

/**
 * The measured set, recorded so it cannot grow unnoticed.
 *
 * Every entry here is a route production and the guard disagree about, and
 * each needs a reason. A route that appears in the measurement but not in this
 * list fails `fastify-owners.test.ts` — that is the fail-closed half of R1,
 * and it fires whether or not any client pair targets the new route.
 */
export const ENV_CONDITIONAL_ROUTES: readonly EnvConditionalRoute[] = [
  // `services/reservations/src/routes/events.ts:181` — a manual
  // event-emitting endpoint registered only when `NODE_ENV !== "production"`,
  // under the unconditional `/api/v1/events` prefix (`app.ts:231`).
  { owner: "reservations", entry: "POST /api/v1/events/test", registeredUnder: "test" },
];

/** `<indent><branch><fragment>` — one node of a `printRoutes()` tree. */
const TREE_NODE = /^((?:(?:│|\s)\s{3})*)(?:├── |└── )(.*)$/;
/** The parenthesised method list a node with handlers ends in. */
const NODE_METHODS = /\s\(([A-Z]+(?:, [A-Z]+)*)\)\s*$/;

/**
 * Every registered `METHOD /full/path` in a `printRoutes({ commonPrefix: false })`
 * tree, in print order.
 *
 * The tree spells each node as a path *fragment* under its parent
 * (`/api/v1/users` → `/` → `me` → `/preferences`), so a full path is the
 * concatenation of the fragments down to it; indentation is four characters
 * per level, which is what gives the depth. Fastify's auto-registered
 * `HEAD`/`OPTIONS` are listed like any other method, so this is longer than a
 * count of distinct paths.
 *
 * This exists for the two-boot diff in {@link bootFastifyOwners} and for the
 * anti-vacuity signal — never for matching, which is always `findRoute`'s job
 * (see this module's header). Pure and exported so the parse itself is
 * testable without booting anything.
 */
export function printedRouteEntries(printedRoutes: string): string[] {
  const entries: string[] = [];
  const fragments: string[] = [];

  for (const line of printedRoutes.split("\n")) {
    const node = TREE_NODE.exec(line);
    const indent = node?.[1];
    const rest = node?.[2];
    if (indent === undefined || rest === undefined) continue;

    const methods = NODE_METHODS.exec(rest);
    const methodNames = methods?.[1]?.split(", ");

    const depth = indent.length / 4;
    fragments.length = depth;
    fragments[depth] = methods === null ? rest : rest.slice(0, -methods[0].length);
    if (methodNames === undefined) continue;

    const path = fragments.join("");
    for (const method of methodNames) entries.push(`${method} ${path}`);
  }

  return entries;
}

/**
 * Counts registered method+path entries in a `printRoutes()` tree.
 *
 * Kept as its own name because that count — not the entries — is what the
 * anti-vacuity contract consumes.
 */
export function countRegisteredRoutes(printedRoutes: string): number {
  return printedRouteEntries(printedRoutes).length;
}

/**
 * The environment a production reference boot needs in order to reach route
 * registration at all. Each entry exists because a `NODE_ENV="production"`
 * boot throws without it — measured, one by one:
 *
 * - `SENTRY_DSN` — `validate-startup-config.ts:61` throws on an empty value in
 *   production. Only emptiness is checked, and an unparseable DSN leaves the
 *   Sentry SDK inert, so this deliberately is not DSN-shaped.
 * - `AUTH_AUTHORITY` / `AUTH_AUDIENCE` — `create-service-app.ts:247` throws in
 *   production unless both are set. `.invalid` is the reserved TLD (RFC 2606);
 *   nothing resolves or fetches it, because registration never verifies a token.
 * - `MANAGE_TOKEN_SECRET` — `services/reservations/src/app.ts:119`
 *   (`getManageTokenConfig`) throws in production when it is missing.
 * - `UNSUBSCRIBE_TOKEN_SECRET` — `services/reservations/src/services/post-visit-notifier.ts:6`
 *   (`getUnsubscribeTokenConfig`) throws in production when it is missing, at
 *   MODULE scope. It only became reachable once {@link importFresh} made the
 *   reference boot evaluate modules under `production` — the earlier
 *   single-evaluation boot read it under `test`, which is the gap it closes.
 *
 * Applied only around the production boot and restored immediately after, so
 * nothing downstream in the same process sees them.
 */
const PRODUCTION_BOOT_ENV: Readonly<Record<string, string>> = {
  NODE_ENV: "production",
  SENTRY_DSN: "disabled",
  AUTH_AUTHORITY: "https://route-contract.invalid/",
  AUTH_AUDIENCE: "route-contract",
  MANAGE_TOKEN_SECRET: "route-contract-reference-boot",
  UNSUBSCRIBE_TOKEN_SECRET: "route-contract-reference-boot",
};

/**
 * Applies `overrides` to `env` and returns the thunk that puts it back —
 * restoring a key that was set, removing one that was not.
 *
 * Exported for its own test: the "was not set" branch is the one that runs in
 * CI, so the "was set" branch would otherwise never be exercised.
 */
export function overrideEnv(
  env: NodeJS.ProcessEnv,
  overrides: Readonly<Record<string, string>>
): () => void {
  const previous = Object.keys(overrides).map((key) => [key, env[key]] as const);
  Object.assign(env, overrides);

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  };
}

/**
 * Evaluates `load`'s module graph afresh, under the `process.env` current at
 * the call.
 *
 * A static import evaluates a module once, under whatever `NODE_ENV` vitest
 * had when this file was first loaded, and every later import returns that
 * same instance. So a gate decided at module scope — `const DEV =
 * process.env.NODE_ENV !== "production"` at the top of a routes file — would
 * give both boots the same answer, and the two-boot diff could never see it.
 * `vi.resetModules()` empties vitest's module registry, so the next import
 * re-runs every workspace module body the service reaches. Packages under
 * `node_modules` (fastify, prisma) are externalised and stay shared, which is
 * fine: a service's own route registration is not in them.
 *
 * This is why the adapter can only run under vitest — it already could only
 * run there (see `edge-owner.ts`'s header).
 */
export async function importFresh<T>(load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return load();
}

/**
 * Boots all three service apps TWICE and returns their route tables.
 *
 * The guard's table has to be the table *production* registers, and a single
 * boot cannot be that table. This function used to boot once with `NODE_ENV`
 * pinned to `test` and rest on the invariant "nothing in the three services'
 * route *registration* reads `NODE_ENV`". **That invariant was false**:
 * `services/reservations/src/routes/events.ts:181` registers `POST /test` only
 * when `NODE_ENV !== "production"`, under the unconditional `/api/v1/events`
 * prefix (`app.ts:231`), so the table held a route production does not — the
 * guard's own false green, in exactly the class it exists to close.
 *
 * So:
 *
 * - **The production reference boot** runs first, under
 *   {@link PRODUCTION_BOOT_ENV}, and is deliberately **never `ready()`-ed**.
 *   `services/reservations/src/app.ts:266` gates the lapsed-guest monitor and
 *   the Redis-backed job worker on `NODE_ENV !== "test"` — but it gates them
 *   by registering `onReady` hooks, and `onReady` fires on `ready()`, which
 *   this never calls. Measured: `buildApp()` and `close()` together open no
 *   socket, resolve no hostname and issue no `fetch`, with `REDIS_URL` set or
 *   unset; `close()` on a never-`ready()`-ed instance does not fire `onReady`;
 *   and `printRoutes`/`findRoute` answer identically before and after
 *   `ready()`, because `buildApp` awaits every `register` call itself.
 *   (Re-measured 2026-09-28 after {@link importFresh} landed: still zero
 *   socket, DNS or `fetch` attempts, `REDIS_URL` set or unset.)
 * - **The `test` boot** runs second, is `ready()`-ed exactly as before, and is
 *   what leaves the process in the `NODE_ENV="test"` state everything
 *   downstream already expects.
 * - **Both boots import every service through {@link importFresh}**, so each
 *   boot evaluates the services' module scope under its own `NODE_ENV`. A
 *   gate decided at module scope (`const DEV = process.env.NODE_ENV !==
 *   "production"` at the top of a routes file) is therefore diffed like one
 *   decided inside a plugin. Before that, both boots shared modules evaluated
 *   once under vitest's ambient `test`, and such a route left the whole suite
 *   green while sitting in the owner table (measured 2026-09-28).
 *
 * Expect `[ERROR] STRIPE_SECRET_KEY is not set` / `[ERROR] REDIS_URL is not
 * set in production` on stderr when this runs: that is the reference boot
 * saying what production says when those are unconfigured, not a failure of
 * the guard. Configuring them away would mean handing the boot fake
 * credentials to quieten a log line.
 *
 * `answers` is the intersection, so a route only one boot registers is never
 * an owner. Both directions are excluded on purpose: a production-only route
 * would be a *false red*, which is the safe direction and is caught by the
 * {@link ENV_CONDITIONAL_ROUTES} assertion before anyone has to diagnose it.
 *
 * What this can NOT see, stated so it is not over-read: a registration gated
 * on a third `NODE_ENV` value (`"staging"`) or on a different variable, and
 * a gate inside a package under `node_modules`, which {@link importFresh}
 * leaves shared.
 */
export async function bootFastifyOwners(): Promise<FastifyOwnerTables> {
  const production = {} as Record<FastifyOwner, App>;
  const productionEntries = {} as Record<FastifyOwner, readonly string[]>;

  const restoreEnv = overrideEnv(process.env, PRODUCTION_BOOT_ENV);
  try {
    for (const owner of FASTIFY_OWNERS) {
      const app = await BUILDERS[owner]();
      production[owner] = app;
      productionEntries[owner] = printedRouteEntries(app.printRoutes({ commonPrefix: false }));
    }
  } finally {
    restoreEnv();
  }

  process.env.NODE_ENV = "test";

  const apps = {} as Record<FastifyOwner, App>;
  const testEntries = {} as Record<FastifyOwner, readonly string[]>;
  const counts = {} as Record<FastifyOwner, number>;

  for (const owner of FASTIFY_OWNERS) {
    const app = await BUILDERS[owner]();
    await app.ready();
    apps[owner] = app;
    testEntries[owner] = printedRouteEntries(app.printRoutes({ commonPrefix: false }));
    const registeredInProduction = new Set(productionEntries[owner]);
    counts[owner] = testEntries[owner].filter((entry) => registeredInProduction.has(entry)).length;
  }

  const answers = (owner: FastifyOwner, method: HttpMethod, url: string): boolean =>
    apps[owner].findRoute({ method, url }) !== null &&
    production[owner].findRoute({ method, url }) !== null;

  const envConditionalRoutes = (): EnvConditionalRoute[] =>
    FASTIFY_OWNERS.flatMap((owner) => {
      const inTest = new Set(testEntries[owner]);
      const inProduction = new Set(productionEntries[owner]);

      return [
        ...[...inTest]
          .filter((entry) => !inProduction.has(entry))
          .map((entry) => ({ owner, entry, registeredUnder: "test" as const })),
        ...[...inProduction]
          .filter((entry) => !inTest.has(entry))
          .map((entry) => ({ owner, entry, registeredUnder: "production" as const })),
      ].sort((a, b) => a.entry.localeCompare(b.entry));
    });

  return {
    answers,
    ownersOf: (method, url) => FASTIFY_OWNERS.filter((owner) => answers(owner, method, url)),
    routeCount: (owner) => counts[owner],
    testBootRouteCount: (owner) => testEntries[owner].length,
    envConditionalRoutes,
    openApiDocument: (owner) => apps[owner].swagger(),
    close: async () => {
      for (const owner of FASTIFY_OWNERS) {
        await apps[owner].close();
        await production[owner].close();
      }
    },
  };
}
