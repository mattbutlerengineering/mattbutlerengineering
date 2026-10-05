/**
 * Pins the Fastify adapter against the 2026-08-30 floor-plan defect —
 * permanently, with no working-tree edit.
 *
 * `FloorPlansClient.setActive` posted to `/floor-plans/:id/active` and
 * `bulkUpdatePositions` to `/floor-plans/:id/bulk-update-positions`, while
 * reservations registered `/:id/activate` and `/tables/positions`. Both halves
 * were green; the deployed API answered 404 to both. These four rows are the
 * distinction the whole run exists to make mechanical, and they are asserted
 * here at the adapter level so the pin survives even if the client changes.
 *
 * This is NOT the end-to-end proof — that is the scratch-edit run in
 * `docs/fixes/api-client-route-contract/verification.md`. Do not collapse them.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  bootFastifyOwners,
  countRegisteredRoutes,
  ENV_CONDITIONAL_ROUTES,
  FASTIFY_OWNERS,
  importFresh,
  overrideEnv,
  printedRouteEntries,
} from "./fastify-owners.js";
import type { FastifyOwnerTables } from "./fastify-owners.js";
import { PLACEHOLDER } from "./types.js";

let owners: FastifyOwnerTables;

beforeAll(async () => {
  owners = await bootFastifyOwners();
});

afterAll(async () => {
  await owners?.close();
});

describe("countRegisteredRoutes", () => {
  it("sums the methods on every route node", () => {
    const printed = [
      "├── /api/v1/users (GET, HEAD, POST)",
      "│   └── / (GET, HEAD, POST)",
      "│       ├── me (GET, HEAD)",
      "│       │   └── /preferences (PATCH)",
      "│       └── :id (GET, HEAD, PATCH, DELETE)",
      "└── * (OPTIONS)",
    ].join("\n");

    expect(countRegisteredRoutes(printed)).toBe(14);
  });

  it("counts nothing in a tree with no route nodes", () => {
    expect(countRegisteredRoutes("")).toBe(0);
    expect(countRegisteredRoutes("(not a route line)\nplain text")).toBe(0);
  });
});

describe("printedRouteEntries", () => {
  it("reconstructs each node's full path from the tree it is printed in", () => {
    const printed = [
      "├── /api/v1/users (GET, HEAD, POST)",
      "│   └── / (GET, HEAD, POST)",
      "│       ├── me (GET, HEAD)",
      "│       │   └── /preferences (PATCH)",
      "│       └── :id (GET, HEAD, PATCH, DELETE)",
      "└── * (OPTIONS)",
    ].join("\n");

    expect(printedRouteEntries(printed)).toEqual([
      "GET /api/v1/users",
      "HEAD /api/v1/users",
      "POST /api/v1/users",
      "GET /api/v1/users/",
      "HEAD /api/v1/users/",
      "POST /api/v1/users/",
      "GET /api/v1/users/me",
      "HEAD /api/v1/users/me",
      "PATCH /api/v1/users/me/preferences",
      "GET /api/v1/users/:id",
      "HEAD /api/v1/users/:id",
      "PATCH /api/v1/users/:id",
      "DELETE /api/v1/users/:id",
      "OPTIONS *",
    ]);
  });

  it("finds nothing in a tree with no route nodes", () => {
    expect(printedRouteEntries("")).toEqual([]);
    expect(printedRouteEntries("(not a route line)\nplain text")).toEqual([]);
  });
});

describe("overrideEnv", () => {
  it("restores a key that was set, and removes one that was not", () => {
    const env: NodeJS.ProcessEnv = { PRESENT: "original" };

    const restore = overrideEnv(env, { PRESENT: "overridden", ABSENT: "added" });
    expect(env).toEqual({ PRESENT: "overridden", ABSENT: "added" });

    restore();
    expect(env).toEqual({ PRESENT: "original" });
  });
});

describe("importFresh", () => {
  // R1, second pass. A service can decide an env gate when its module is
  // EVALUATED — `const DEV = process.env.NODE_ENV !== "production"` at the top
  // of a routes file — rather than when its plugin runs. A static import
  // evaluates that once, under whatever NODE_ENV vitest had, so both boots
  // would share the `test` answer and the two-boot diff could never see the
  // gate (measured 2026-09-28: such a route left all 16 tests here green).
  it("re-evaluates module scope under the environment current at each call", async () => {
    const load = () => import("./module-scope-env.fixture.js");
    const evaluatedUnder = async (nodeEnv: string) => {
      const restore = overrideEnv(process.env, { NODE_ENV: nodeEnv });
      try {
        return (await importFresh(load)).NODE_ENV_AT_EVALUATION;
      } finally {
        restore();
      }
    };

    expect(await evaluatedUnder("production")).toBe("production");
    expect(await evaluatedUnder("test")).toBe("test");
  });
});

describe("bootFastifyOwners", () => {
  // Reaching this assertion at all is the measurement: `beforeAll` booted all
  // three apps to `ready()` with no database, no mocks and no fixtures. Prisma
  // connects lazily and `findRoute` never enters a handler, so no query is
  // issued. CI's `Test (Node 22)` job sets no `DATABASE_URL` (the three jobs
  // that do — integration, RLS, migrate-dryrun — are separate), so that
  // condition holds where it counts. It is deliberately not asserted on
  // `process.env`: a developer with `DATABASE_URL` exported would get a red
  // that says nothing about the code.
  it("boots all three services to ready() with no mocks", () => {
    for (const owner of FASTIFY_OWNERS) {
      expect(owners.routeCount(owner)).toBeGreaterThan(0);
    }
  });

  it("exposes the test boot's OpenAPI document (the route side of schema parity)", () => {
    const doc = owners.openApiDocument("reservations") as { paths?: Record<string, unknown> };
    expect(doc.paths).toHaveProperty("/api/v1/guests/lapsing");
  });

  it("matches by runtime path, not by pattern spelling", () => {
    // The measurement that made findRoute the choice: this concrete URL
    // resolves against the registered `/api/v1/users/:id`, which `hasRoute`
    // reports as a miss for the same input.
    expect(owners.answers("users", "GET", `/api/v1/users/${PLACEHOLDER}`)).toBe(true);
    expect(owners.ownersOf("GET", `/api/v1/users/${PLACEHOLDER}`)).toEqual(["users"]);
  });

  it("reports no owner for a path nobody registers", () => {
    expect(owners.ownersOf("GET", `/api/v1/not-a-real-collection/${PLACEHOLDER}`)).toEqual([]);
  });

  // The 2026-08-30 pair. Left column is what the client sent and production
  // 404'd on; right column is what reservations actually registers.
  it.each([
    ["POST", `/api/v1/floor-plans/${PLACEHOLDER}/active`, []],
    ["POST", `/api/v1/floor-plans/${PLACEHOLDER}/activate`, ["reservations"]],
    ["POST", `/api/v1/floor-plans/${PLACEHOLDER}/bulk-update-positions`, []],
    ["POST", "/api/v1/floor-plans/tables/positions", ["reservations"]],
  ] as const)("%s %s is owned by %j", (method, url, expected) => {
    expect(owners.ownersOf(method, url)).toEqual(expected);
  });

  // R1. The table has to be the table PRODUCTION registers. Until this run,
  // `bootFastifyOwners` pinned `NODE_ENV="test"` and rested on the invariant
  // "nothing in the three services' route registration reads NODE_ENV" — which
  // is false: `services/reservations/src/routes/events.ts:181` registers
  // `POST /test` only when `NODE_ENV !== "production"`, under the unconditional
  // `/api/v1/events` prefix (`app.ts:231`). A client pair aimed at an env-gated
  // route would have found an owner here and a 404 in production: the
  // 2026-08-30 defect class, reproduced through the guard built to end it.
  it("reports no owner for a route only a non-production boot registers", () => {
    expect(owners.ownersOf("POST", "/api/v1/events/test")).toEqual([]);
  });

  it("still reports the owner of a sibling route under the same prefix", () => {
    // The exclusion above must be the env-conditional route and nothing else:
    // `/api/v1/events/stream` is registered unconditionally under the same
    // prefix, so a fix that dropped the whole prefix would pass the assertion
    // above while gutting the table.
    expect(owners.ownersOf("GET", "/api/v1/events/stream")).toEqual(["reservations"]);
  });

  it("measures the environment-conditional set, and it is exactly the recorded one", () => {
    // The fail-closed half. This set is MEASURED by booting each service twice
    // and diffing the two route tables — never hand-listed — so a NEW route
    // registered behind an env gate fails here on its own, with no client pair
    // having to target it first.
    expect(
      owners.envConditionalRoutes(),
      "A service registers a route under one NODE_ENV and not another, and it is not the " +
        "recorded set. Either the route should not be env-gated, or add it to " +
        "ENV_CONDITIONAL_ROUTES in fastify-owners.ts with a reason. Do not widen it silently."
    ).toEqual(ENV_CONDITIONAL_ROUTES);
  });

  it("counts the effective table — what both boots register — not the test boot's", () => {
    // reservations registers exactly one more entry under `test` than under
    // `production`; the anti-vacuity signal has to describe the table
    // `answers()` actually consults, or it is measuring a different thing than
    // the guard is asserting on.
    expect(owners.routeCount("reservations")).toBe(owners.testBootRouteCount("reservations") - 1);
    for (const owner of ["users", "agent"] as const) {
      expect(owners.routeCount(owner)).toBe(owners.testBootRouteCount(owner));
    }
  });
});
