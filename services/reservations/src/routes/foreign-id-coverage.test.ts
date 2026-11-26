import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../app.js";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

/**
 * Local, DB-free tripwire for #9713. `venue-scope-coverage.test.ts` proves each
 * route declares its OWN venue; nothing proved that a second entity id the
 * caller supplies (a `guestId` on hold confirm, #9277) belongs to that venue.
 *
 * This reads every route's body and querystring schema from the OpenAPI
 * document and requires each field that names a venue-scoped entity to be
 * listed in `FOREIGN_ID_GUARDS`, with the guard that checks it against the
 * route's venue (and the test that proves it), or a reason it needs none.
 */
const ENTITY_ID_FIELD =
  /^(guest|table|reservation|floorPlan|section|waitlistEntry|deposit|hold)Ids?$/;

/**
 * `guard`: where the id is checked against the route's venue; `provenBy`: the
 * test file (relative to `src/`) holding the foreign-venue case.
 * `none`: why no check is needed.
 * - "is the scope": the route's venue is resolved FROM this id, so it cannot be foreign.
 * - "filter only": the id only narrows a read already filtered by the route's
 *   venue; a foreign id matches nothing.
 */
type Guard = { guard: string; provenBy: string } | { none: "is the scope" | "filter only" };

const FOREIGN_ID_GUARDS: Readonly<Record<string, Guard>> = {
  // Deposits: the venue is resolved from the reservation itself.
  "GET /api/v1/deposits query.reservationId": { none: "is the scope" },
  "POST /api/v1/deposits body.reservationId": { none: "is the scope" },
  "POST /public/v1/venues/:slug/deposits/payment-intent body.reservationId": {
    guard: "public-deposits.ts: reservation.venueId !== policy.id → 404",
    provenBy: "routes/public-deposits.test.ts",
  },

  // Floor plans, sections, tables.
  "GET /api/v1/floor-plan-sections query.floorPlanId": { none: "filter only" },
  "POST /api/v1/floor-plan-sections body.floorPlanId": {
    guard: "floorPlanSectionService.create: floor plan looked up with { id, venueId }",
    provenBy: "routes/floor-plan-sections.test.ts",
  },
  "PUT /api/v1/floor-plan-sections/order body.floorPlanId": {
    guard: "floorPlanSectionService.reorder: every where carries venueId",
    provenBy: "services/floor-plan-section.test.ts",
  },
  "PUT /api/v1/floor-plan-sections/:sectionId/tables body.tableIds": {
    guard:
      "floorPlanSectionService.assignTables: tables filtered by venueId and the section's plan",
    provenBy: "routes/floor-plan-sections.test.ts",
  },
  "POST /api/v1/floor-plans/tables/:tableId/assign body.floorPlanId": {
    guard: "floor-plans.ts: scope + cross-venue check (#5008)",
    provenBy: "routes/floor-plans.test.ts",
  },
  "POST /api/v1/floor-plans/tables/positions body.floorPlanId": {
    guard:
      "floor-plans.ts: floorPlanId is the scope; positions[].tableId cross-venue check (#5042)",
    provenBy: "routes/floor-plans.test.ts",
  },
  "POST /api/v1/tables body.floorPlanId": {
    guard: "tables.ts POST: floor plan must belong to the body's venue (#9713)",
    provenBy: "routes/tables.test.ts",
  },
  "PATCH /api/v1/tables/:id body.floorPlanId": {
    guard: "tables.ts PATCH: floor plan venue === table venue (#5514)",
    provenBy: "routes/tables.test.ts",
  },
  "PATCH /api/v1/tables/:id body.sectionId": {
    guard: "tables.ts PATCH: section must be on the target floor plan",
    provenBy: "routes/tables.test.ts",
  },

  // Holds and reservations.
  "POST /api/v1/holds body.tableId": {
    guard: "holdService: isTableInVenue → TABLE_NOT_IN_VENUE",
    provenBy: "routes/holds.test.ts",
  },
  "POST /api/v1/holds/:id/confirm body.guestId": {
    guard: "holds.ts: resolveGuestLink against the hold's venue (#9277)",
    provenBy: "routes/holds.test.ts",
  },
  "POST /public/v1/venues/:slug/reservations body.holdId": {
    guard: "confirmHold: hold.venueId !== venueId → rejected",
    provenBy: "services/confirm-hold.test.ts",
  },
  "PATCH /public/v1/reservations/manage body.holdId": {
    guard: "reservation-modification: held.venueId !== venueId → HOLD_NOT_FOUND",
    provenBy: "services/reservation-modification.test.ts",
  },
  "GET /api/v1/reservations query.guestId": { none: "is the scope" },
  "GET /api/v1/reservations query.tableId": { none: "filter only" },
  "POST /api/v1/reservations body.guestId": {
    guard: "reservations.ts: resolveGuestLink against the body's venue",
    provenBy: "routes/reservations.test.ts",
  },
  "POST /api/v1/reservations body.tableId": {
    guard: "reservationService.create: isTableInVenue → TABLE_NOT_IN_VENUE",
    provenBy: "services/reservation.test.ts",
  },
  "PATCH /api/v1/reservations/:id body.tableId": {
    guard: "reservationService.update: isTableInVenue → TABLE_NOT_IN_VENUE",
    provenBy: "services/reservation.test.ts",
  },
  "POST /api/v1/reservations/walk-in body.guestId": {
    guard: "reservations.ts walk-in: resolveGuestLink against the body's venue",
    provenBy: "routes/reservations.test.ts",
  },
  "POST /api/v1/reservations/walk-in body.tableId": {
    guard: "createWalkIn: isTableInVenue → tableNotInVenue 403",
    provenBy: "routes/reservations.test.ts",
  },
  "POST /api/v1/reservations/walk-in body.waitlistEntryId": {
    guard: "createWalkIn: updateMany where { id, venueId, waiting }; 0 rows rolls back",
    provenBy: "services/reservation.test.ts",
  },
  "POST /api/v1/venues/:id/availability/check body.tableId": { none: "filter only" },
};

interface OpenApiOperation {
  parameters?: { in: string; name: string }[];
  requestBody?: { content?: Record<string, { schema?: { properties?: object } }> };
}

function entityIdFields(spec: { paths: Record<string, Record<string, OpenApiOperation>> }) {
  const found: string[] = [];
  for (const [path, ops] of Object.entries(spec.paths)) {
    // A prefix-root route prints as "/x/"; the same route as "/x" (see normalizeRouteKey).
    const routePath = path.replace(/\{(\w+)\}/g, ":$1").replace(/(.)\/$/, "$1");
    for (const [method, op] of Object.entries(ops)) {
      const route = `${method.toUpperCase()} ${routePath}`;
      const query = (op.parameters ?? []).filter((p) => p.in === "query").map((p) => p.name);
      const body = Object.keys(
        op.requestBody?.content?.["application/json"]?.schema?.properties ?? {}
      );
      for (const [where, names] of [
        ["query", query],
        ["body", body],
      ] as const) {
        for (const name of names) {
          if (ENTITY_ID_FIELD.test(name)) found.push(`${route} ${where}.${name}`);
        }
      }
    }
  }
  return found.sort();
}

describe("foreign entity id coverage (no database)", () => {
  const originalEnv = process.env;
  let app: FastifyInstance;
  let fields: string[];

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    app = await buildApp({ logger: false });
    await app.ready();
    fields = entityIdFields(app.swagger() as never);
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it("finds entity id fields at all (the scan is not silently empty)", () => {
    expect(fields.length).toBeGreaterThan(0);
  });

  it("every entity id field in a body or query names its venue guard or a reason", () => {
    const unlisted = fields.filter((field) => !(field in FOREIGN_ID_GUARDS));
    expect(unlisted, "check the id against the route's venue, then list it here").toEqual([]);
  });

  it("every guard cites a test file that exists and names the field", () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");
    const broken = Object.entries(FOREIGN_ID_GUARDS).flatMap(([key, entry]) => {
      if (!("provenBy" in entry)) return [];
      const file = join(srcDir, entry.provenBy);
      const field = key.split(".").at(-1) ?? "";
      return existsSync(file) && readFileSync(file, "utf8").includes(field) ? [] : [key];
    });
    expect(broken).toEqual([]);
  });

  it("no registry entry names a field that no longer exists", () => {
    const live = new Set(fields);
    expect(Object.keys(FOREIGN_ID_GUARDS).filter((key) => !live.has(key))).toEqual([]);
  });
});
