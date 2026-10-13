import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { bodyVenueId, inNamedVenueContext, queryVenueId } from "./named-venue.js";
import { getCurrentVenueId, runWithVenueContext } from "../services/venue-context-store.js";

const request = (parts: { query?: unknown; body?: unknown }): FastifyRequest =>
  parts as unknown as FastifyRequest;

describe("queryVenueId / bodyVenueId", () => {
  it("read a string venueId from the query / body", () => {
    expect(queryVenueId(request({ query: { venueId: "v1" } }))).toBe("v1");
    expect(bodyVenueId(request({ body: { venueId: "v2" } }))).toBe("v2");
  });

  it.each([
    ["missing", {}],
    ["non-string", { venueId: 42 }],
    ["null container", null],
  ])("return null when the key is %s", (_label, container) => {
    expect(queryVenueId(request({ query: container }))).toBeNull();
    expect(bodyVenueId(request({ body: container }))).toBeNull();
  });

  it("return an empty-string venueId as-is (a string, so a context is entered)", () => {
    expect(queryVenueId(request({ query: { venueId: "" } }))).toBe("");
    expect(bodyVenueId(request({ body: { venueId: "" } }))).toBe("");
  });

  it("do not read each other's container", () => {
    expect(queryVenueId(request({ body: { venueId: "v" } }))).toBeNull();
    expect(bodyVenueId(request({ query: { venueId: "v" } }))).toBeNull();
  });
});

describe("inNamedVenueContext", () => {
  it("runs the work in the named venue's context, across awaits", async () => {
    const seen = await inNamedVenueContext("venue-1", async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return getCurrentVenueId();
    });
    expect(seen).toBe("venue-1");
  });

  it.each([null, undefined])("runs with no context of its own when venueId is %s", async (id) => {
    const seen = await runWithVenueContext("outer", () =>
      inNamedVenueContext(id, async () => getCurrentVenueId())
    );
    // No venue named: the work neither enters nor clears a context.
    expect(seen).toBe("outer");
    expect(await inNamedVenueContext(id, async () => getCurrentVenueId())).toBeNull();
  });

  it("enters a context for an empty-string venueId, as the old hook did", async () => {
    expect(await inNamedVenueContext("", async () => getCurrentVenueId())).toBe("");
  });

  it("does not leak the context past the work", async () => {
    await inNamedVenueContext("venue-1", async () => undefined);
    expect(getCurrentVenueId()).toBeNull();
  });
});
