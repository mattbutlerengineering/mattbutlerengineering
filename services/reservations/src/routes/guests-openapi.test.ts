/**
 * Route-level OpenAPI baseline for the guests domain
 * (docs/fixes/endpoint-definitions-pilot, item 2.1).
 *
 * The "OpenAPI output unchanged" constraint of the endpoint-definition
 * migration is measured against this snapshot: it boots the real app and
 * pins `app.swagger().paths` for every `/api/v1/guests*` operation (shared
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

function guestsPaths(): Record<string, unknown> {
  const doc = app.swagger() as { paths?: Record<string, unknown> };
  return Object.fromEntries(
    Object.entries(doc.paths ?? {})
      .filter(([path]) => path === "/api/v1/guests" || path.startsWith("/api/v1/guests/"))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
}

describe("guests OpenAPI baseline", () => {
  it("documents all 11 guests operations", () => {
    const operations = Object.values(guestsPaths()).flatMap((item) =>
      Object.keys(item as Record<string, unknown>).filter((key) =>
        ["get", "post", "patch", "put", "delete"].includes(key)
      )
    );
    expect(operations).toHaveLength(11);
  });

  it("matches the recorded swagger paths for /api/v1/guests*", () => {
    expect(guestsPaths()).toMatchSnapshot();
  });
});
