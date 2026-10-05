/**
 * Route-level OpenAPI baseline for the guests domain
 * (docs/fixes/endpoint-definitions-pilot, item 2.1).
 *
 * The "OpenAPI output unchanged" constraint of the endpoint-definition
 * migration is measured against this snapshot: it boots the real app and
 * pins `app.swagger().paths` for every guests operation (shared
 * entities appear as `#/components/schemas/def-N` refs). A migration that changes
 * any derived schema — a dropped description, a `required` that was never
 * there, a lost `$ref` — fails here before it ships. The entity-level
 * baselines (`schemas/schema-baseline.json`, `schemas.test.ts.snap`) cover
 * the shared `Guest#` / `GuestSegment#` shapes themselves and are not
 * duplicated.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

/**
 * The 11 guests operations (defect.md pilot table), selected by operationId
 * so the selection itself holds no route literal. A renamed operationId or a
 * moved path both change the snapshot.
 */
const GUESTS_OPERATION_IDS = [
  "listGuests",
  "searchGuests",
  "getGuestSegments",
  "getGuestById",
  "createGuest",
  "findOrCreateGuest",
  "updateGuest",
  "addGuestNote",
  "getLapsingGuests",
  "sendGuestWinBack",
  "deleteGuest",
];

const HTTP_VERBS = ["get", "post", "patch", "put", "delete"];

function guestsPaths(): Record<string, Record<string, unknown>> {
  const doc = app.swagger() as {
    paths?: Record<string, Record<string, { operationId?: string }>>;
  };
  const selected: Record<string, Record<string, unknown>> = {};
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const [verb, operation] of Object.entries(item)) {
      if (
        !HTTP_VERBS.includes(verb) ||
        !GUESTS_OPERATION_IDS.includes(operation.operationId ?? "")
      ) {
        continue;
      }
      selected[path] = { ...selected[path], [verb]: operation };
    }
  }
  return Object.fromEntries(
    Object.entries(selected).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
}

describe("guests OpenAPI baseline", () => {
  it("documents all 11 guests operations", () => {
    const operations = Object.values(guestsPaths()).flatMap((item) => Object.keys(item));
    expect(operations).toHaveLength(GUESTS_OPERATION_IDS.length);
  });

  it("matches the recorded swagger paths for the guests operations", () => {
    expect(guestsPaths()).toMatchSnapshot();
  });
});
