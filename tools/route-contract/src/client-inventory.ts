/**
 * Client driver: produces the client's emitted surface by RUNNING it.
 *
 * Static extraction was measured blind to 7 of ~54 paths — `reservations.ts`
 * and `deposits.ts` compose theirs from module-level constants and, for
 * `deposits.transition`, a union-typed segment. So this constructs the real
 * `createApiClient({ baseUrl: "" })` plus the real `AgentSessionClient`,
 * replaces `globalThis.fetch` with a 204-returning recorder, and invokes every
 * method. Whatever the client actually sends is what gets checked.
 *
 * It lives here and not in `packages/api-client` deliberately: that package
 * carries `size-limit` budgets, and this is something only CI reads.
 *
 * ## How it cannot silently narrow
 *
 * Three independent ways, because an enumeration that quietly shrinks is a
 * guard that quietly stops guarding:
 *
 * 1. {@link ROSTER} is explicit and {@link exportedClientClassNames} is read
 *    off the real module, so a sub-client wired into `index.ts` but not into
 *    the roster fails the suite.
 * 2. Every prototype method is either driven or named in {@link EXEMPT_METHODS}
 *    with a reason — a new method on an existing sub-client fails too.
 * 3. Request counts are per INVOCATION, never a deduplicated set. The three
 *    aliases that re-emit an earlier path (`floorPlans.get`,
 *    `floorPlans.activate`, `reservations.cancelWithReason`) are real requests
 *    and are counted as such; a set-growth check reports them as issuing
 *    nothing, which is a false positive in exactly the place a real regression
 *    would look identical.
 */
import { createApiClient, AgentSessionClient, ApiClient } from "@mbe/api-client";
import * as apiClientModule from "@mbe/api-client";
import type { DepositTransition } from "@mbe/api-client";
import type { AnyEndpointDefinition, toResponseJsonSchema } from "@mbe/types";

import { PLACEHOLDER } from "./types.js";
import type { ClientPair, HttpMethod } from "./types.js";

/**
 * Client methods that legitimately issue no HTTP request, with the reason each
 * one is here. Anything not on this list that issues nothing fails the suite.
 */
export const EXEMPT_METHODS: Readonly<Record<string, string>> = {
  "holds.setSessionId": "pure setter — stores the session id for later hold calls",
  "holds.getSessionId": "pure getter — returns the stored session id",
  "holds.sessionHeaders": "private header builder; throws when ownership is unprovable",
};

/**
 * Known blind spot, stated rather than implied: `streamNDJSON(config)` takes a
 * caller-supplied `config.url` (`packages/api-client/src/streaming.ts:35-36`)
 * and holds no literal of its own, so there is nothing here for the guard to
 * pin. Every caller that builds its own URL is outside this contract.
 */
export const KNOWN_BLIND_SPOTS: Readonly<Record<string, string>> = {
  streamNDJSON: "takes a caller-supplied config.url and holds no path literal of its own",
};

/**
 * Every deposit state transition, exhaustively.
 *
 * `deposits.transition(id, action)` composes `${BASE}/${id}/${action}` from a
 * union (`deposits.ts:14`, `:66-68`) — three server routes behind one
 * template, which the generic argument filler cannot produce. Typed as
 * `Record<DepositTransition, …>`, so adding a fourth member to
 * `DepositTransition` without adding it here fails
 * `pnpm --dir tools/route-contract typecheck`. That is a compile-time gate,
 * not a runtime one: vitest does not typecheck.
 */
export const DEPOSIT_TRANSITION_ARGS: Readonly<Record<DepositTransition, readonly unknown[]>> = {
  capture: [PLACEHOLDER, "capture"],
  refund: [PLACEHOLDER, "refund"],
  forfeit: [PLACEHOLDER, "forfeit"],
};

/**
 * Argument overrides for the methods the generic filler gets wrong.
 *
 * The default is to pass {@link PLACEHOLDER} for every declared parameter,
 * which is right almost everywhere: an id, a slug, a token and a body all
 * survive it, and a params object degrades into a query string that gets
 * stripped anyway. It is wrong where a path segment is read OUT of an object
 * (`availability.ts:32`, `:40` destructure `venueId` before building the
 * path), and where a segment comes from a union. Each override is one entry;
 * a method whose default is wrong in a way that still issues a request is
 * caught by {@link assertPathsAreWellFormed}, not by this table.
 */
const ARGUMENT_OVERRIDES: Readonly<Record<string, readonly (readonly unknown[])[]>> = {
  "availability.getTimeSlots": [[{ venueId: PLACEHOLDER, date: "2026-01-01", partySize: 2 }]],
  "availability.getDates": [
    [{ venueId: PLACEHOLDER, startDate: "2026-01-01", endDate: "2026-01-02", partySize: 2 }],
  ],
  "deposits.transition": Object.values(DEPOSIT_TRANSITION_ARGS),
};

/** One invocation of one client method, and how many requests it issued. */
export interface Invocation {
  /** e.g. `"floorPlans.setActive"`. */
  readonly clientMethod: string;
  /** Requests issued by THIS call. Zero is a failure unless exempt. */
  readonly requestCount: number;
  readonly exempt: boolean;
}

/** A Zod schema as the client holds it (the shape `toResponseJsonSchema` accepts). */
export type ClientSchema = Parameters<typeof toResponseJsonSchema>[0];

/**
 * What one issued request DECLARED — the client side of schema parity
 * (`schema-parity.ts`). Captured by spies on the transport, so it is what the
 * real client passes, not what its source looks like it passes.
 */
export interface SchemaCapture {
  readonly clientMethod: string;
  readonly subClient: string;
  readonly method: HttpMethod;
  /** Query-stripped, exactly as the request was issued. */
  readonly path: string;
  /** Present when the request went through `ApiClient.call(def, …)`. */
  readonly definition?: AnyEndpointDefinition;
  /** The schema `ApiClient.request` validated the response with, if any. */
  readonly response?: ClientSchema;
}

export interface ClientInventory {
  /** One entry per issued request, in issue order. */
  readonly schemaCaptures: readonly SchemaCapture[];
  /** Deduplicated `method + path`, each carrying every client method that emits it. */
  readonly pairs: readonly ClientPair[];
  /** One entry per method call made, in roster order. */
  readonly invocations: readonly Invocation[];
  /** Roster sub-client names, e.g. `"floorPlans"`. */
  readonly subClients: readonly string[];
  /** How many distinct pairs a given sub-client contributed. */
  pairCount(subClient: string): number;
}

interface RosterEntry {
  readonly name: string;
  readonly instance: object;
  /** Run before each invocation on this sub-client. */
  readonly prepare?: () => void;
}

/**
 * Every `*Client` CLASS the package exports, read off the real module.
 *
 * PascalCase is load-bearing, not cosmetic: the factory is called
 * `createApiClient`, which also ends in "Client" and is a function, not a
 * sub-client to drive.
 */
const CLIENT_CLASS_NAME = /^[A-Z]\w*Client$/;

export function exportedClientClassNames(): string[] {
  return Object.entries(apiClientModule)
    .filter(([name, value]) => typeof value === "function" && CLIENT_CLASS_NAME.test(name))
    .map(([name]) => name)
    .sort();
}

function methodNamesOf(instance: object): string[] {
  // Own prototype only. AgentSessionClient extends ApiClient, and walking up
  // would enumerate the transport (request/get/post/…) as client surface.
  //
  // Deliberately NOT sorted: `getOwnPropertyNames` on a class prototype yields
  // declaration order, so `producedBy[0]` is the method that declares a path
  // and an alias delegating to it comes second. Sorting would still enumerate
  // everything — the inventory is identical either way — but it would shuffle
  // which half of each alias pair is "first", and `client-driver-completeness`
  // pins the three the architecture measured by name.
  return Object.getOwnPropertyNames(Object.getPrototypeOf(instance))
    .filter((name) => name !== "constructor")
    .filter((name) => typeof (instance as Record<string, unknown>)[name] === "function");
}

function buildRoster(): { roster: RosterEntry[]; transportClassName: string } {
  const api = createApiClient({ baseUrl: "" });
  const agentSessions = new AgentSessionClient({ baseUrl: "" });

  const roster: RosterEntry[] = [
    { name: "users", instance: api.users },
    { name: "reservations", instance: api.reservations },
    { name: "venues", instance: api.venues },
    { name: "venueGroups", instance: api.venueGroups },
    { name: "tables", instance: api.tables },
    { name: "guests", instance: api.guests },
    { name: "floorPlans", instance: api.floorPlans },
    { name: "publicVenue", instance: api.publicVenue },
    { name: "waitlist", instance: api.waitlist },
    { name: "availability", instance: api.availability },
    {
      name: "holds",
      instance: api.holds,
      // Four of the hold methods throw without a session id, before issuing
      // their request. Re-seeded per invocation because createForVenue adopts
      // the server's id from a body the 204 recorder does not return.
      prepare: () => api.holds.setSessionId(PLACEHOLDER),
    },
    { name: "briefing", instance: api.briefing },
    { name: "deposits", instance: api.deposits },
    { name: "health", instance: api.health },
    // NOT in createApiClient (index.ts:81-97 omits it) — it extends ApiClient
    // and takes a ClientConfig directly (agent-sessions.ts:38-41). Missed
    // entirely unless constructed separately.
    { name: "agentSessions", instance: agentSessions },
  ];

  return { roster, transportClassName: api.client.constructor.name };
}

/**
 * Drives the whole client surface and returns what it put on the wire.
 *
 * `globalThis.fetch` is swapped inside a `try/finally`, so a throwing client
 * method cannot leave the process without a real `fetch`. Throws ARE expected
 * and are swallowed: several methods read `.data` off the 204's undefined
 * body and blow up *after* the request was already recorded — which is the
 * only part this cares about. Retry and timeout never engage: the recorder
 * answers 204 synchronously, `client.ts:109` only retries 502/503/504, and
 * `AbortSignal.timeout(30_000)` never fires.
 */
export async function driveClient(): Promise<ClientInventory> {
  const { roster } = buildRoster();

  const records: { method: HttpMethod; path: string; clientMethod: string; subClient: string }[] =
    [];
  const invocations: Invocation[] = [];

  const schemaCaptures: SchemaCapture[] = [];

  const realFetch = globalThis.fetch;
  let current: { clientMethod: string; subClient: string; count: number } | null = null;

  // Transport spies. `call` records the definition it was handed; `request`
  // (which every path, `call` included, goes through) records the response
  // schema. Prototype-level so AgentSessionClient — which extends ApiClient —
  // is covered too.
  const realCall = ApiClient.prototype.call;
  const realRequest = ApiClient.prototype.request;
  let pendingDefinition: AnyEndpointDefinition | undefined;
  ApiClient.prototype.call = function (this: ApiClient, ...args: Parameters<typeof realCall>) {
    pendingDefinition = args[0];
    try {
      // `request` runs synchronously up to its first await inside this
      // call, so the capture has already been recorded by the time it
      // returns; the reset only stops a `call` that threw before reaching
      // `request` from leaking its definition into the next request.
      return realCall.apply(this, args);
    } finally {
      pendingDefinition = undefined;
    }
  } as typeof realCall;
  ApiClient.prototype.request = function (
    this: ApiClient,
    ...args: Parameters<typeof realRequest>
  ) {
    const [path, options, schema] = args;
    if (current) {
      schemaCaptures.push({
        clientMethod: current.clientMethod,
        subClient: current.subClient,
        method: (options?.method ?? "GET") as HttpMethod,
        path: path.split("?")[0] ?? path,
        ...(pendingDefinition && { definition: pendingDefinition }),
        ...(schema && { response: schema as ClientSchema }),
      });
    }
    pendingDefinition = undefined;
    return realRequest.apply(this, args);
  } as typeof realRequest;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (current) {
      current.count += 1;
      records.push({
        method: (init?.method ?? "GET") as HttpMethod,
        // Two client paths embed a query string in the path literal
        // (reservations.ts:100, :183); buildQueryString adds one for every
        // params object. Neither is part of the route.
        path: href.split("?")[0] ?? href,
        clientMethod: current.clientMethod,
        subClient: current.subClient,
      });
    }
    return new Response(null, { status: 204 });
  }) as typeof globalThis.fetch;

  try {
    for (const entry of roster) {
      for (const methodName of methodNamesOf(entry.instance)) {
        const qualified = `${entry.name}.${methodName}`;
        const exempt = qualified in EXEMPT_METHODS;
        const fn = (entry.instance as Record<string, (...args: unknown[]) => unknown>)[methodName];
        const argSets = ARGUMENT_OVERRIDES[qualified] ?? [
          Array.from({ length: fn?.length ?? 0 }, () => PLACEHOLDER),
        ];

        for (const args of argSets) {
          entry.prepare?.();
          current = { clientMethod: qualified, subClient: entry.name, count: 0 };
          try {
            await fn?.apply(entry.instance, [...args]);
          } catch {
            // Expected: the 204 recorder returns no body, so methods that read
            // `.data` off the response throw after the request was recorded.
          }
          invocations.push({ clientMethod: qualified, requestCount: current.count, exempt });
          current = null;
        }
      }
    }
  } finally {
    globalThis.fetch = realFetch;
    ApiClient.prototype.call = realCall;
    ApiClient.prototype.request = realRequest;
  }

  const byPair = new Map<string, { pair: ClientPair; subClients: Set<string> }>();
  for (const record of records) {
    const key = `${record.method} ${record.path}`;
    const existing = byPair.get(key);
    if (existing) {
      if (!existing.pair.producedBy.includes(record.clientMethod)) {
        (existing.pair.producedBy as string[]).push(record.clientMethod);
      }
      existing.subClients.add(record.subClient);
    } else {
      byPair.set(key, {
        pair: { method: record.method, path: record.path, producedBy: [record.clientMethod] },
        subClients: new Set([record.subClient]),
      });
    }
  }

  const entries = [...byPair.values()];

  return {
    schemaCaptures,
    pairs: entries.map((e) => e.pair),
    invocations,
    subClients: roster.map((entry) => entry.name),
    pairCount: (subClient) => entries.filter((e) => e.subClients.has(subClient)).length,
  };
}

/** Every method name on the roster, qualified — driven or exempt. */
export function rosterMethodNames(): string[] {
  return buildRoster()
    .roster.flatMap((entry) => methodNamesOf(entry.instance).map((m) => `${entry.name}.${m}`))
    .sort();
}

/** The transport base class, which is not a sub-client and drives nothing. */
export function transportClassName(): string {
  return buildRoster().transportClassName;
}

/** Roster sub-client constructor names, for the against-exports assertion. */
export function rosterClassNames(): string[] {
  return buildRoster()
    .roster.map((entry) => entry.instance.constructor.name)
    .sort();
}

/**
 * Segments a generated path must never contain. Each one is the signature of a
 * placeholder that did not land where it was meant to — `undefined` from a
 * destructured field, `[object Object]` from an object interpolated into a
 * template, `NaN` from an arithmetic default. They produce a path that still
 * issues a request, so the per-invocation count cannot see them.
 */
const MALFORMED_SEGMENTS = ["undefined", "null", "[object Object]", "NaN", ""] as const;

export function malformedPaths(pairs: readonly ClientPair[]): string[] {
  return pairs
    .filter((pair) => {
      const segments = pair.path.split("/").slice(1);
      return segments.some((segment) =>
        (MALFORMED_SEGMENTS as readonly string[]).includes(segment)
      );
    })
    .map((pair) => `${pair.method} ${pair.path} (from ${pair.producedBy.join(", ")})`);
}
