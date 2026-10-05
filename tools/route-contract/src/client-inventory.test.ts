/**
 * What the client driver produced, and that it produced all of it.
 *
 * The narrowing guards proper — per-invocation request counts, the exempt
 * list, the exhaustive deposit map — live in
 * `client-driver-completeness.test.ts`.
 */
import { describe, it, expect, beforeAll } from "vitest";

import {
  driveClient,
  exportedClientClassNames,
  rosterClassNames,
  malformedPaths,
  transportClassName,
  KNOWN_BLIND_SPOTS,
} from "./client-inventory.js";
import type { ClientInventory } from "./client-inventory.js";
import { PLACEHOLDER } from "./types.js";
import { MINIMUM_CLIENT_PAIRS } from "./vacuity.js";

let inventory: ClientInventory;

beforeAll(async () => {
  inventory = await driveClient();
});

describe("the placeholder", () => {
  it("is a single opaque segment", () => {
    expect(PLACEHOLDER).not.toMatch(/[/?#]/);
    expect(PLACEHOLDER.length).toBeGreaterThan(0);
  });
});

describe("driveClient", () => {
  it("emits at least the measured surface", () => {
    expect(inventory.pairs.length).toBeGreaterThanOrEqual(MINIMUM_CLIENT_PAIRS);
  });

  it("records the client method that produced each pair", () => {
    for (const pair of inventory.pairs) {
      expect(pair.producedBy.length).toBeGreaterThan(0);
      for (const producer of pair.producedBy) expect(producer).toMatch(/^[a-zA-Z]+\.[a-zA-Z]+$/);
    }
  });

  it("emits only absolute, well-formed paths", () => {
    expect(malformedPaths(inventory.pairs)).toEqual([]);
    for (const pair of inventory.pairs) expect(pair.path).toMatch(/^\//);
  });

  it("strips query strings, including the ones baked into path literals", () => {
    // reservations.ts:100 and :183 and venues.ts:106 embed `?page=&limit=` /
    // `?token=` directly in the literal; every params object adds one via
    // buildQueryString. None of it is part of the route.
    for (const pair of inventory.pairs) expect(pair.path).not.toContain("?");

    const paths = inventory.pairs.map((pair) => `${pair.method} ${pair.path}`);
    expect(paths).toContain("GET /api/v1/reservations/me");
    expect(paths).toContain("GET /api/v1/reservations");
    expect(paths).toContain("GET /api/v1/venues");
    expect(paths).toContain("GET /api/v1/venues/groups");
    expect(paths).toContain("GET /public/v1/reservations/manage");
  });

  it("includes AgentSessionClient, which createApiClient does not wire up", () => {
    // index.ts:81-97 omits it; it extends ApiClient and takes a ClientConfig
    // directly (agent-sessions.ts:38-41). Constructing the factory alone
    // misses all four /v1/sessions paths.
    const sessionPaths = inventory.pairs
      .filter((pair) => pair.path.startsWith("/v1/sessions"))
      .map((pair) => `${pair.method} ${pair.path}`)
      .sort();

    expect(sessionPaths).toEqual([
      "GET /v1/sessions",
      `GET /v1/sessions/${PLACEHOLDER}`,
      "POST /v1/sessions",
      `POST /v1/sessions/${PLACEHOLDER}/cancel`,
    ]);
  });
});

describe("the roster", () => {
  it("covers every *Client class the package exports", () => {
    // The one way this enumeration can silently narrow: a sub-client wired
    // into index.ts but never added here. Everything exported is either a
    // roster member or the transport base itself.
    const covered = new Set([...rosterClassNames(), transportClassName()]);
    const uncovered = exportedClientClassNames().filter((name) => !covered.has(name));

    expect(uncovered).toEqual([]);
  });

  it("has every sub-client contribute at least one pair", () => {
    for (const subClient of inventory.subClients) {
      expect(inventory.pairCount(subClient), `${subClient} contributed no pairs`).toBeGreaterThan(
        0
      );
    }
  });
});

describe("known blind spots", () => {
  it("names streamNDJSON, which holds no path literal to pin", () => {
    // Stated rather than implied: streaming.ts:35-36 takes a caller-supplied
    // config.url, so there is nothing here for the guard to check. Anything
    // that builds its own URL is outside this contract.
    expect(KNOWN_BLIND_SPOTS.streamNDJSON).toMatch(/caller-supplied config\.url/);
    expect(inventory.pairs.some((pair) => pair.producedBy.includes("streamNDJSON"))).toBe(false);
  });
});

describe("schema captures (the client side of schema parity)", () => {
  it("captures the response schema a driven guests.list call validates with", () => {
    const capture = inventory.schemaCaptures.find((c) => c.clientMethod === "guests.list");
    expect(capture?.method).toBe("GET");
    // The capture describes the very request the pair inventory recorded.
    const pair = inventory.pairs.find((p) => p.producedBy.includes("guests.list"));
    expect(pair).toBeDefined();
    expect(capture?.path).toBe(pair?.path);
    expect(capture?.response).toBeDefined();
  });

  it("records a request with no response schema (a body-less 204) as such, not as a missing capture", () => {
    const capture = inventory.schemaCaptures.find((c) => c.clientMethod === "guests.delete");
    expect(capture).toBeDefined();
    expect(capture?.definition).toBeDefined();
    expect(capture?.response).toBeUndefined();
  });

  it("captures one entry per issued request", () => {
    const issued = inventory.invocations.reduce((sum, i) => sum + i.requestCount, 0);
    expect(inventory.schemaCaptures).toHaveLength(issued);
  });
});
