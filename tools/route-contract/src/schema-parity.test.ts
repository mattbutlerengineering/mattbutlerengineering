/**
 * Unit tests for the pure schema-parity normalizer and comparator.
 *
 * The drifted fixtures (one per facet) are the meaningful red: a normalizer
 * that erased everything would pass every "equal" case below, so each facet
 * also has a case that MUST report a mismatch at the right JSON pointer.
 */
import { describe, it, expect } from "vitest";

import {
  normalize,
  firstDifference,
  queryFromParameters,
  refTableFromOpenApi,
  routeFacets,
  compareFacet,
} from "./schema-parity.js";
import { findOperation } from "./route-contract.js";

const refs = refTableFromOpenApi({
  components: {
    schemas: {
      "def-7": {
        title: "Guest",
        type: "object",
        properties: { id: { type: "string" }, email: { type: ["null", "string"] } },
        required: ["id", "email"],
      },
    },
  },
});

describe("normalize", () => {
  it("resolves a Fastify-style `Guest#` ref and a swagger `#/components/schemas/def-N` ref to the same schema", () => {
    const fastify = normalize({ $ref: "Guest#" }, "response", refs);
    const swagger = normalize({ $ref: "#/components/schemas/def-7" }, "response", refs);
    expect(fastify).toEqual(swagger);
    expect(fastify).toEqual({
      type: "object",
      properties: { id: { type: "string" }, email: { type: "string", nullable: true } },
    });
  });

  it("reports an unresolvable ref as itself instead of erasing it", () => {
    expect(normalize({ $ref: "Missing#" }, "response", refs)).toEqual({ $ref: "Missing#" });
  });

  it("drops documentation keys: description, $id, title, examples, $schema", () => {
    expect(
      normalize(
        {
          $id: "X",
          $schema: "http://json-schema.org/draft-07/schema#",
          title: "X",
          description: "d",
          examples: [1],
          type: "string",
        },
        "body",
        refs
      )
    ).toEqual({ type: "string" });
  });

  it("drops additionalProperties / propertyNames (stripped from every derived schema)", () => {
    expect(
      normalize(
        { type: "object", additionalProperties: false, propertyNames: { type: "string" } },
        "body",
        refs
      )
    ).toEqual({ type: "object" });
  });

  it("drops `required` on the response side only, and sorts it elsewhere", () => {
    const schema = { type: "object", properties: {}, required: ["b", "a"] };
    expect(normalize(schema, "response", refs)).toEqual({ type: "object", properties: {} });
    expect(normalize(schema, "body", refs)).toEqual({
      type: "object",
      properties: {},
      required: ["a", "b"],
    });
  });

  it("keeps a property literally named `required`", () => {
    expect(
      normalize({ type: "object", properties: { required: { type: "boolean" } } }, "response", refs)
    ).toEqual({ type: "object", properties: { required: { type: "boolean" } } });
  });

  it("unifies the three nullable spellings", () => {
    const openapi = normalize({ type: "string", nullable: true }, "body", refs);
    expect(normalize({ anyOf: [{ type: "string" }, { type: "null" }] }, "body", refs)).toEqual(
      openapi
    );
    expect(normalize({ type: ["null", "string"] }, "body", refs)).toEqual(openapi);
    expect(normalize({ type: ["string", "null"] }, "body", refs)).toEqual(openapi);
    expect(
      normalize({ anyOf: [{ type: "null" }, { type: "string", format: "email" }] }, "body", refs)
    ).toEqual({ type: "string", format: "email", nullable: true });
  });
});

describe("firstDifference", () => {
  it("is null for deep-equal values regardless of key order", () => {
    expect(firstDifference({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBeNull();
  });

  it("returns the JSON pointer of the first difference, escaping ~ and /", () => {
    expect(firstDifference({ a: { b: 1 } }, { a: { b: 2 } })).toBe("/a/b");
    expect(firstDifference({ a: [1, 2] }, { a: [1] })).toBe("/a");
    expect(firstDifference({ "x/y": 1 }, { "x/y": 2 })).toBe("/x~1y");
    expect(firstDifference({ a: 1 }, { a: 1, b: 2 })).toBe("/b");
  });
});

describe("queryFromParameters", () => {
  it("rebuilds a querystring object from swagger `in: query` parameters", () => {
    expect(
      queryFromParameters([
        { in: "query", name: "venueId", required: true, schema: { type: "string" } },
        { in: "query", name: "page", required: false, schema: { type: "string", default: "1" } },
        { in: "path", name: "id", required: true, schema: { type: "string" } },
      ])
    ).toEqual({
      type: "object",
      properties: { venueId: { type: "string" }, page: { type: "string", default: "1" } },
      required: ["venueId"],
    });
  });

  it("is undefined when there are no query parameters", () => {
    expect(queryFromParameters([{ in: "path", name: "id", schema: { type: "string" } }])).toBe(
      undefined
    );
    expect(queryFromParameters(undefined)).toBeUndefined();
  });
});

describe("routeFacets", () => {
  it("reads body, query and the single 2xx JSON response off a swagger operation", () => {
    const facets = routeFacets({
      parameters: [{ in: "query", name: "q", required: true, schema: { type: "string" } }],
      requestBody: { content: { "application/json": { schema: { type: "object" } } } },
      responses: {
        "201": { content: { "application/json": { schema: { type: "boolean" } } } },
        "400": { content: { "application/json": { schema: { $ref: "Error#" } } } },
      },
    });
    expect(facets.body).toEqual({ type: "object" });
    expect(facets.query).toEqual({
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    });
    expect(facets.response).toEqual({ type: "boolean" });
  });

  it("has no response facet for a body-less 204", () => {
    expect(routeFacets({ responses: { "204": { description: "gone" } } }).response).toBeUndefined();
  });
});

describe("compareFacet — one deliberately drifted fixture per facet", () => {
  it("body: a renamed field is reported at its pointer", () => {
    const client = { type: "object", properties: { text: { type: "string" } }, required: ["text"] };
    const route = { type: "object", properties: { note: { type: "string" } }, required: ["note"] };
    expect(compareFacet("body", client, route, refs)).toEqual({
      facet: "body",
      detail: "differs at /properties/note",
    });
  });

  it("query: a parameter the route does not know is reported", () => {
    const client = {
      type: "object",
      properties: { venueId: { type: "string" }, venue: { type: "string" } },
    };
    const route = queryFromParameters([
      { in: "query", name: "venueId", required: false, schema: { type: "string" } },
    ]);
    expect(compareFacet("query", client, route, refs)).toEqual({
      facet: "query",
      detail: "differs at /properties/venue",
    });
  });

  it("response: an entity the route serializes differently is reported through the ref", () => {
    const client = {
      type: "object",
      properties: {
        data: { type: "object", properties: { id: { type: "number" }, email: { type: "string" } } },
      },
    };
    const route = { type: "object", properties: { data: { $ref: "#/components/schemas/def-7" } } };
    expect(compareFacet("response", client, route, refs)).toEqual({
      facet: "response",
      detail: "differs at /properties/data/properties/email/nullable",
    });
  });

  it("equal after normalization is no mismatch", () => {
    const client = { type: "object", properties: { data: { $ref: "Guest#" } }, required: ["data"] };
    const route = {
      description: "Guest found",
      type: "object",
      properties: { data: { $ref: "#/components/schemas/def-7" } },
    };
    expect(compareFacet("response", client, route, refs)).toBeNull();
  });

  it("reports a schema declared on one side only, and nothing when neither declares one", () => {
    expect(compareFacet("body", undefined, { type: "object" }, refs)).toEqual({
      facet: "body",
      detail: "client declares no schema; the route registers one",
    });
    expect(compareFacet("response", { type: "object" }, undefined, refs)).toEqual({
      facet: "response",
      detail: "route registers no schema; the client declares one",
    });
    expect(compareFacet("query", undefined, undefined, refs)).toBeNull();
  });
});

describe("findOperation", () => {
  const doc = {
    paths: {
      "/v1/things/": { get: { operationId: "list" } },
      "/v1/things/{id}": { get: { operationId: "byId" }, delete: { operationId: "del" } },
      "/v1/things/lapsing": { get: { operationId: "lapsing" } },
    },
  };
  const op = (method: string, path: string) =>
    (
      findOperation(doc as Parameters<typeof findOperation>[0], method, path) as
        { operationId?: string } | undefined
    )?.operationId;

  it("prefers a static template over a parameterised one, as find-my-way does", () => {
    expect(op("GET", "/v1/things/lapsing")).toBe("lapsing");
    expect(op("GET", "/v1/things/abc")).toBe("byId");
  });

  it("ignores the trailing slash Fastify documents a prefixed '/' route with", () => {
    expect(op("GET", "/v1/things")).toBe("list");
  });

  it("falls through to the parameterised template when the static one lacks the method", () => {
    expect(op("DELETE", "/v1/things/lapsing")).toBe("del");
    expect(op("POST", "/v1/things/abc")).toBeUndefined();
  });
});
