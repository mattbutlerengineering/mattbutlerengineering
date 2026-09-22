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

import { bootFastifyOwners, countRegisteredRoutes, FASTIFY_OWNERS } from "./fastify-owners.js";
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
});
