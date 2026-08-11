import { describe, it, expect } from "vitest";
import type { FastifyRequest } from "fastify";
import { venueIdFromQuery, venueIdFromBody, venueIdFromParams } from "./venue-access.js";

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
