import { describe, it, expect, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import {
  venueIdFromQuery,
  venueIdFromBody,
  venueIdFromParams,
  venueIdFromEntity,
} from "./venue-access.js";

describe("venueIdFromQuery", () => {
  it("returns the venueId when a valid string is present in the query", () => {
    const request = { query: { venueId: "venue-1" } } as unknown as FastifyRequest;

    expect(venueIdFromQuery(request)).toBe("venue-1");
  });

  it("returns null when venueId is missing from the query", () => {
    const request = { query: {} } as unknown as FastifyRequest;

    expect(venueIdFromQuery(request)).toBe(null);
  });

  it("returns null when venueId is an array (repeated query param)", () => {
    const request = { query: { venueId: ["a", "b"] } } as unknown as FastifyRequest;

    expect(venueIdFromQuery(request)).toBe(null);
  });

  it("returns null when venueId is a number", () => {
    const request = { query: { venueId: 42 } } as unknown as FastifyRequest;

    expect(venueIdFromQuery(request)).toBe(null);
  });

  it("returns null when venueId is a plain object", () => {
    const request = { query: { venueId: { nested: true } } } as unknown as FastifyRequest;

    expect(venueIdFromQuery(request)).toBe(null);
  });

  it("returns null without throwing when request.query is null", () => {
    const request = { query: null } as unknown as FastifyRequest;

    expect(venueIdFromQuery(request)).toBe(null);
  });

  it("returns null without throwing when request.query is undefined", () => {
    const request = { query: undefined } as unknown as FastifyRequest;

    expect(venueIdFromQuery(request)).toBe(null);
  });
});

describe("venueIdFromBody", () => {
  it("returns the venueId when a valid string is present in the body", () => {
    const request = { body: { venueId: "venue-1" } } as unknown as FastifyRequest;

    expect(venueIdFromBody(request)).toBe("venue-1");
  });

  it("returns null when venueId is missing from the body", () => {
    const request = { body: {} } as unknown as FastifyRequest;

    expect(venueIdFromBody(request)).toBe(null);
  });

  it("returns null when venueId is an array", () => {
    const request = { body: { venueId: ["a", "b"] } } as unknown as FastifyRequest;

    expect(venueIdFromBody(request)).toBe(null);
  });

  it("returns null when venueId is a number", () => {
    const request = { body: { venueId: 42 } } as unknown as FastifyRequest;

    expect(venueIdFromBody(request)).toBe(null);
  });

  it("returns null when venueId is a plain object", () => {
    const request = { body: { venueId: { nested: true } } } as unknown as FastifyRequest;

    expect(venueIdFromBody(request)).toBe(null);
  });

  it("returns null without throwing when request.body is null", () => {
    const request = { body: null } as unknown as FastifyRequest;

    expect(venueIdFromBody(request)).toBe(null);
  });

  it("returns null without throwing when request.body is undefined", () => {
    const request = { body: undefined } as unknown as FastifyRequest;

    expect(venueIdFromBody(request)).toBe(null);
  });
});

describe("venueIdFromParams", () => {
  it("returns the venueId when a valid string is present in params", () => {
    const request = { params: { venueId: "venue-1" } } as unknown as FastifyRequest;

    expect(venueIdFromParams(request)).toBe("venue-1");
  });

  it("returns null when venueId is missing from params", () => {
    const request = { params: {} } as unknown as FastifyRequest;

    expect(venueIdFromParams(request)).toBe(null);
  });

  it("returns null when venueId is an array", () => {
    const request = { params: { venueId: ["a", "b"] } } as unknown as FastifyRequest;

    expect(venueIdFromParams(request)).toBe(null);
  });

  it("returns null when venueId is a number", () => {
    const request = { params: { venueId: 42 } } as unknown as FastifyRequest;

    expect(venueIdFromParams(request)).toBe(null);
  });

  it("returns null when venueId is a plain object", () => {
    const request = { params: { venueId: { nested: true } } } as unknown as FastifyRequest;

    expect(venueIdFromParams(request)).toBe(null);
  });

  it("returns null without throwing when request.params is null", () => {
    const request = { params: null } as unknown as FastifyRequest;

    expect(venueIdFromParams(request)).toBe(null);
  });

  it("returns null without throwing when request.params is undefined", () => {
    const request = { params: undefined } as unknown as FastifyRequest;

    expect(venueIdFromParams(request)).toBe(null);
  });
});

describe("venueIdFromEntity", () => {
  const getKey = (request: FastifyRequest) => (request.params as { id?: unknown }).id;

  it("returns null without loading when the key is missing", async () => {
    const load = vi.fn();
    const resolver = venueIdFromEntity(getKey, load);
    const request = { params: {} } as unknown as FastifyRequest;

    await expect(resolver(request)).resolves.toBe(null);
    expect(load).not.toHaveBeenCalled();
  });

  it("returns null when the entity is not found", async () => {
    const load = vi.fn().mockResolvedValue(null);
    const resolver = venueIdFromEntity(getKey, load);
    const request = { params: { id: "entity-1" } } as unknown as FastifyRequest;

    await expect(resolver(request)).resolves.toBe(null);
    expect(load).toHaveBeenCalledWith("entity-1");
  });

  it("returns the entity's venueId when found", async () => {
    const load = vi.fn().mockResolvedValue({ venueId: "venue-1" });
    const resolver = venueIdFromEntity(getKey, load);
    const request = { params: { id: "entity-1" } } as unknown as FastifyRequest;

    await expect(resolver(request)).resolves.toBe("venue-1");
  });

  it("returns null when the entity is found with a null venueId", async () => {
    const load = vi.fn().mockResolvedValue({ venueId: null });
    const resolver = venueIdFromEntity(getKey, load);
    const request = { params: { id: "entity-1" } } as unknown as FastifyRequest;

    await expect(resolver(request)).resolves.toBe(null);
  });
});
