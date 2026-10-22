import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";

const URL_ = "/api/v1/floor-plan-sections";
const Q = "?venueId=venue-1";
const ADMIN = { "x-auth-bypass": "true" };

const section = {
  id: "sec-1",
  venueId: "venue-1",
  floorPlanId: "fp-1",
  name: "Patio",
  color: "#3366cc",
  displayOrder: 0,
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
};

const svc = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  reorder: vi.fn(),
  assignTables: vi.fn(),
};

describe("Floor plan section routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    app = await buildApp({
      logger: false,
      services: { floorPlanSectionService: svc as never },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: `${URL_}${Q}` });
    expect(res.statusCode).toBe(401);
    expect(svc.list).not.toHaveBeenCalled();
  });

  it("returns 403 for a venue the caller is not a member of", async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        sub: "auth0|outsider",
        iss: "https://test.auth0.com/",
        aud: "https://api.example.com",
        permissions: [],
      },
      protectedHeader: { alg: "RS256" },
    } as never);
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(false);
    const scoped = await buildApp({
      logger: false,
      venueMembershipLookup: lookup,
      services: { floorPlanSectionService: svc as never },
    });
    await scoped.ready();
    const res = await scoped.inject({
      method: "GET",
      url: `${URL_}${Q}`,
      headers: { authorization: "Bearer outsider-token" },
    });
    expect(res.statusCode).toBe(403);
    expect(svc.list).not.toHaveBeenCalled();
    await scoped.close();
  });

  it("requires venueId", async () => {
    const res = await app.inject({ method: "GET", url: URL_, headers: ADMIN });
    expect(res.statusCode).toBe(400);
  });

  it("lists sections, optionally for one floor plan", async () => {
    svc.list.mockResolvedValueOnce([section]);
    const res = await app.inject({
      method: "GET",
      url: `${URL_}${Q}&floorPlanId=fp-1`,
      headers: ADMIN,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(svc.list).toHaveBeenCalledWith("venue-1", "fp-1");
  });

  it("creates a section scoped to the query venue", async () => {
    svc.create.mockResolvedValueOnce(section);
    const res = await app.inject({
      method: "POST",
      url: `${URL_}${Q}`,
      headers: ADMIN,
      payload: { floorPlanId: "fp-1", name: "Patio", color: "#3366cc" },
    });
    expect(res.statusCode).toBe(201);
    expect(svc.create).toHaveBeenCalledWith("venue-1", {
      floorPlanId: "fp-1",
      name: "Patio",
      color: "#3366cc",
    });
  });

  it("404s a create under a floor plan of another venue, and 400s a bad colour", async () => {
    svc.create.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: "POST",
      url: `${URL_}${Q}`,
      headers: ADMIN,
      payload: { floorPlanId: "other", name: "Patio" },
    });
    expect(res.statusCode).toBe(404);
    const bad = await app.inject({
      method: "POST",
      url: `${URL_}${Q}`,
      headers: ADMIN,
      payload: { floorPlanId: "fp-1", name: "Patio", color: "blue" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("renames/recolours a section and 404s an unknown one", async () => {
    svc.update.mockResolvedValueOnce(section);
    const ok = await app.inject({
      method: "PATCH",
      url: `${URL_}/sec-1${Q}`,
      headers: ADMIN,
      payload: { name: "Bar" },
    });
    expect(ok.statusCode).toBe(200);
    expect(svc.update).toHaveBeenCalledWith("venue-1", "sec-1", { name: "Bar" });
    svc.update.mockResolvedValueOnce(null);
    const missing = await app.inject({
      method: "PATCH",
      url: `${URL_}/nope${Q}`,
      headers: ADMIN,
      payload: { name: "Bar" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("passes a floor material through the body schema, and rejects one outside the enum", async () => {
    // The body JSON schema is what decides this: a property it does not declare
    // is silently stripped by Fastify, which would make the material unsavable.
    svc.update.mockResolvedValueOnce({ ...section, floorMaterial: "hardwood" });
    const set = await app.inject({
      method: "PATCH",
      url: `${URL_}/sec-1${Q}`,
      headers: ADMIN,
      payload: { floorMaterial: "hardwood" },
    });
    expect(set.statusCode).toBe(200);
    expect(svc.update).toHaveBeenCalledWith("venue-1", "sec-1", { floorMaterial: "hardwood" });

    svc.update.mockResolvedValueOnce({ ...section, floorMaterial: null });
    const cleared = await app.inject({
      method: "PATCH",
      url: `${URL_}/sec-1${Q}`,
      headers: ADMIN,
      payload: { floorMaterial: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(svc.update).toHaveBeenLastCalledWith("venue-1", "sec-1", { floorMaterial: null });

    const rejected = await app.inject({
      method: "PATCH",
      url: `${URL_}/sec-1${Q}`,
      headers: ADMIN,
      payload: { floorMaterial: "lava" },
    });
    expect(rejected.statusCode).toBe(400);
  });

  it("deletes a section (204) and 404s an unknown one", async () => {
    svc.delete.mockResolvedValueOnce(true);
    expect(
      (await app.inject({ method: "DELETE", url: `${URL_}/sec-1${Q}`, headers: ADMIN })).statusCode
    ).toBe(204);
    svc.delete.mockResolvedValueOnce(false);
    expect(
      (await app.inject({ method: "DELETE", url: `${URL_}/nope${Q}`, headers: ADMIN })).statusCode
    ).toBe(404);
  });

  it("reorders sections and 404s a foreign id", async () => {
    svc.reorder.mockResolvedValueOnce([section]);
    const ok = await app.inject({
      method: "PUT",
      url: `${URL_}/order${Q}`,
      headers: ADMIN,
      payload: { floorPlanId: "fp-1", ids: ["sec-1"] },
    });
    expect(ok.statusCode).toBe(200);
    expect(svc.reorder).toHaveBeenCalledWith("venue-1", "fp-1", ["sec-1"]);
    svc.reorder.mockResolvedValueOnce(null);
    const bad = await app.inject({
      method: "PUT",
      url: `${URL_}/order${Q}`,
      headers: ADMIN,
      payload: { floorPlanId: "fp-1", ids: ["foreign"] },
    });
    expect(bad.statusCode).toBe(404);
  });

  it("assigns tables to a section and 404s when the section or a table is not found", async () => {
    svc.assignTables.mockResolvedValueOnce([]);
    const ok = await app.inject({
      method: "PUT",
      url: `${URL_}/sec-1/tables${Q}`,
      headers: ADMIN,
      payload: { tableIds: ["t1"] },
    });
    expect(ok.statusCode).toBe(200);
    expect(svc.assignTables).toHaveBeenCalledWith("venue-1", "sec-1", ["t1"]);
    svc.assignTables.mockResolvedValueOnce(null);
    const bad = await app.inject({
      method: "PUT",
      url: `${URL_}/sec-1/tables${Q}`,
      headers: ADMIN,
      payload: { tableIds: ["foreign"] },
    });
    expect(bad.statusCode).toBe(404);
  });
});
