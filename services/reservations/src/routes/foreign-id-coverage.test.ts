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
const ENTITY_ID_FIELD = /Ids?$/;

/**
 * Id-shaped fields that are not another venue-scoped entity, excluded by EXACT
 * name only (never a pattern, so a new `fooId` is always classified).
 */
const EXCLUDED_ID_FIELDS: Readonly<Record<string, string>> = {
  venueId: "the route's own venue, covered by venue-scope-coverage.test.ts",
  // External ids name something at a third party, not a row this service scopes by venue.
  paymentIntentId: "Stripe payment intent id (external)",
  // Tracing ids identify a request, not an entity.
  requestId: "request id (tracing)",
  correlationId: "correlation id (tracing)",
};

/**
 * `guard`: where the id is checked against the route's venue; `provenBy`: the
 * test file (relative to `src/`) holding the foreign-venue case.
 * `none`: why no check is needed.
 * - "is the scope": the route's venue is resolved FROM this id, so it cannot be foreign.
 * - "filter only": the id only narrows a read already filtered by the route's
 *   venue; a foreign id matches nothing.
 * - "new row id": the client names the id of the row this request creates; an id
 *   that already exists fails the unique key and writes nothing.
 * - "derived slot id": computed from the route's own venue and matched against
 *   values computed for that venue; it names no stored row.
 */
type Guard =
  | { guard: string; provenBy: string }
  | { none: "is the scope" | "filter only" | "new row id" | "derived slot id" };

const CLOSURE_REFERENCES = {
  guard: "referenceIssues via impactInTransaction: must be a row of this venue (unknown_reference)",
  provenBy: "services/closure-impact-store.test.ts",
} as const;

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
  "POST /api/v1/floor-plans/tables/positions body.positions[].tableId": {
    guard: "floor-plans.ts: every positions[].tableId is checked against the venue (#5042)",
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

  // Venue groups: a group sits above venues, and placing a venue in one is admin-only.
  "GET /api/v1/venues query.venueGroupId": { none: "filter only" },
  "POST /api/v1/venues body.venueGroupId": {
    guard: "venues.ts POST: admin-only when venueGroupId is set",
    provenBy: "routes/venues.test.ts",
  },
  "PATCH /api/v1/venues/:id body.venueGroupId": {
    guard: "venues.ts PATCH: a non-admin may not change the venue group (#5515)",
    provenBy: "routes/venues.test.ts",
  },

  // Availability history, Tonight and closures.
  "GET /api/v1/venues/:id/availability/changes query.actorId": { none: "filter only" },
  "POST /api/v1/venues/:id/tonight body.ruleId": { none: "new row id" },
  "POST /api/v1/venues/:id/tonight body.change.tableIds": {
    guard: "commitSave: referenceIssues must find every table in this venue (unknown_reference)",
    provenBy: "services/tonight-command.test.ts",
  },
  "POST /api/v1/venues/:id/tonight body.change.venueServiceId": {
    guard: "close-early runs the closure command: referenceIssues via impactInTransaction",
    provenBy: "services/tonight-command.test.ts",
  },
  "POST /api/v1/venues/:id/tonight body.decisions[].reservationIds": { none: "filter only" },
  "POST /api/v1/venues/:id/closures body.decisions[].reservationIds": { none: "filter only" },
  "POST /api/v1/venues/:id/closures body.rule.sectionId": CLOSURE_REFERENCES,
  "POST /api/v1/venues/:id/closures body.rule.seriesId": CLOSURE_REFERENCES,
  "POST /api/v1/venues/:id/closures body.rule.tableIds": CLOSURE_REFERENCES,
  "POST /api/v1/venues/:id/closures body.rule.useScheduleId": CLOSURE_REFERENCES,
  "POST /api/v1/venues/:id/closures body.rule.venueServiceId": CLOSURE_REFERENCES,
  "POST /api/v1/venues/:id/closures/impact body.rule.sectionId": CLOSURE_REFERENCES,
  "POST /api/v1/venues/:id/closures/impact body.rule.seriesId": CLOSURE_REFERENCES,
  "POST /api/v1/venues/:id/closures/impact body.rule.tableIds": CLOSURE_REFERENCES,
  "POST /api/v1/venues/:id/closures/impact body.rule.useScheduleId": CLOSURE_REFERENCES,
  "POST /api/v1/venues/:id/closures/impact body.rule.venueServiceId": CLOSURE_REFERENCES,

  // Public rebook.
  "POST /public/v1/reservations/manage/rebook body.offerId": { none: "derived slot id" },
};

interface Schema {
  $ref?: string;
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
}

interface OpenApiOperation {
  parameters?: { in: string; name: string }[];
  requestBody?: { content?: Record<string, { schema?: Schema }> };
}

interface OpenApiSpec {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, Schema> };
}

/** Nesting levels followed below the top level (`positions[].tableId` is one). */
const MAX_NESTING = 1;

function entityIdFields(spec: OpenApiSpec) {
  const schemas = spec.components?.schemas ?? {};
  const resolve = (schema: Schema | undefined): Schema | undefined =>
    schema?.$ref == null
      ? schema
      : resolve(schemas[schema.$ref.replace("#/components/schemas/", "")]);

  // Id field paths in `raw`: top-level names, then `name.child` / `name[].child` one level down.
  const idsIn = (raw: Schema | undefined, prefix: string, depth: number): string[] => {
    const schema = resolve(raw);
    if (schema == null) return [];
    const parts = [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])];
    const fromParts = parts.flatMap((part) => idsIn(part, prefix, depth));
    const fromItems = depth > 0 ? idsIn(schema.items, `${prefix}[].`, depth - 1) : [];
    const fromProps = Object.entries(schema.properties ?? {}).flatMap(([name, prop]) => {
      const own =
        ENTITY_ID_FIELD.test(name) && !(name in EXCLUDED_ID_FIELDS) ? [prefix + name] : [];
      const child = resolve(prop);
      const nested =
        depth === 0 || child == null
          ? []
          : child.items == null
            ? idsIn(child, `${prefix}${name}.`, depth - 1)
            : idsIn(child.items, `${prefix}${name}[].`, depth - 1);
      return [...own, ...nested];
    });
    return [...fromParts, ...fromItems, ...fromProps];
  };

  const found: string[] = [];
  for (const [path, ops] of Object.entries(spec.paths)) {
    // A prefix-root route prints as "/x/"; the same route as "/x" (see normalizeRouteKey).
    const routePath = path.replace(/\{(\w+)\}/g, ":$1").replace(/(.)\/$/, "$1");
    for (const [method, op] of Object.entries(ops)) {
      const route = `${method.toUpperCase()} ${routePath}`;
      const query = (op.parameters ?? [])
        .filter((p) => p.in === "query" && ENTITY_ID_FIELD.test(p.name))
        .filter((p) => !(p.name in EXCLUDED_ID_FIELDS))
        .map((p) => p.name);
      const body = Object.values(op.requestBody?.content ?? {}).flatMap((media) =>
        idsIn(media.schema, "", MAX_NESTING)
      );
      found.push(...query.map((name) => `${route} query.${name}`));
      found.push(...body.map((name) => `${route} body.${name}`));
    }
  }
  return [...new Set(found)].sort();
}

const EXPECTED_FIELD_COUNT = 46;

describe("entityIdFields", () => {
  const spec = {
    paths: {
      "/things/{id}/": {
        post: {
          parameters: [
            { in: "query", name: "ownerId" },
            { in: "query", name: "venueId" },
            { in: "query", name: "page" },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  properties: {
                    fooId: { type: "string" },
                    venueId: { type: "string" },
                    name: { type: "string" },
                    plan: { $ref: "#/components/schemas/Plan" },
                    rows: { type: "array", items: { $ref: "#/components/schemas/Row" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Plan: { properties: { zoneIds: { type: "array" }, label: { type: "string" } } },
        Row: { properties: { barId: { type: "string" } } },
      },
    },
  };

  it("collects top-level, $ref-resolved and nested array ids, and skips excluded names", () => {
    expect(entityIdFields(spec)).toEqual([
      "POST /things/:id body.fooId",
      "POST /things/:id body.plan.zoneIds",
      "POST /things/:id body.rows[].barId",
      "POST /things/:id query.ownerId",
    ]);
  });
});

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

  it("finds exactly the entity id fields the registry classifies (the scan cannot shrink)", () => {
    // Raise this with the registry; never lower it to make a smaller scan pass.
    expect(fields).toHaveLength(EXPECTED_FIELD_COUNT);
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
