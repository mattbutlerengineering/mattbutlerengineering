import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import {
  defineEndpoint,
  problem,
  successResponse,
  type EndpointInput,
  type EndpointSuccess,
  type EndpointRouteGeneric,
} from "./define.js";
import type { ProblemDetails } from "../api.js";

const Thing = z.object({ id: z.string(), name: z.string().nullable() });

const getThing = defineEndpoint({
  method: "GET",
  path: "/api/v1/things/:id",
  params: z.object({ id: z.string() }),
  responses: {
    200: { description: "Found", body: z.object({ data: Thing }) },
    404: problem("Not found"),
  },
});

const listThings = defineEndpoint({
  method: "GET",
  path: "/api/v1/things",
  query: z.object({ venueId: z.string(), page: z.string().default("1") }),
  responses: { 200: { body: z.object({ data: z.array(Thing) }) }, 401: problem() },
});

const createThing = defineEndpoint({
  method: "POST",
  path: "/api/v1/things",
  body: z.object({ name: z.string() }),
  responses: { 201: { body: z.object({ data: Thing }) } },
});

const deleteThing = defineEndpoint({
  method: "DELETE",
  path: "/api/v1/things/:id",
  params: z.object({ id: z.string() }),
  responses: { 204: { description: "Deleted", body: null }, 409: problem("Conflict") },
});

describe("defineEndpoint", () => {
  it("is an identity function — the definition is plain data", () => {
    const def = {
      method: "GET",
      path: "/api/v1/x",
      responses: { 200: { body: z.object({}) } },
    } as const;
    expect(defineEndpoint(def)).toBe(def);
  });

  it("keeps every declared facet on the returned definition", () => {
    expect(listThings.query?.shape).toHaveProperty("venueId");
    expect(createThing.method).toBe("POST");
    expect(createThing.body?.shape).toHaveProperty("name");
  });

  it("problem() marks an RFC 7807 response, with an optional description", () => {
    expect(problem("Not found")).toEqual({ kind: "problem", description: "Not found" });
    expect(problem()).toEqual({ kind: "problem" });
  });

  it("successResponse() returns the single 2xx entry and its status", () => {
    expect(successResponse(getThing)).toEqual({
      status: 200,
      response: getThing.responses[200],
    });
    expect(successResponse(deleteThing)).toEqual({
      status: 204,
      response: { description: "Deleted", body: null },
    });
  });

  it("successResponse() throws when a definition has no or several 2xx entries (runtime backstop)", () => {
    const none = { method: "GET", path: "/x", responses: { 404: problem() } };
    const two = {
      method: "GET",
      path: "/x",
      responses: { 200: { body: null }, 201: { body: null } },
    };
    expect(() => successResponse(none as never)).toThrow(/exactly one 2xx/);
    expect(() => successResponse(two as never)).toThrow(/exactly one 2xx/);
  });
});

describe("derived types (enforced by `pnpm typecheck`, not by vitest)", () => {
  it("EndpointInput contains only the declared keys", () => {
    expectTypeOf<EndpointInput<typeof getThing>>().toEqualTypeOf<{ params: { id: string } }>();
    expectTypeOf<EndpointInput<typeof listThings>>().toEqualTypeOf<{
      query: { venueId: string; page?: string | undefined };
    }>();
    expectTypeOf<EndpointInput<typeof createThing>>().toEqualTypeOf<{
      body: { name: string };
    }>();
  });

  it("EndpointSuccess is the z.output of the single 2xx body, undefined for a null 204", () => {
    expectTypeOf<EndpointSuccess<typeof getThing>>().toEqualTypeOf<{
      data: { id: string; name: string | null };
    }>();
    expectTypeOf<EndpointSuccess<typeof deleteThing>>().toEqualTypeOf<undefined>();
  });

  it("EndpointRouteGeneric uses z.output (querystring defaults applied) and a ProblemDetails reply", () => {
    type G = EndpointRouteGeneric<typeof listThings>;
    expectTypeOf<G["Querystring"]>().toEqualTypeOf<{ venueId: string; page: string }>();
    expectTypeOf<G["Reply"]>().toEqualTypeOf<
      { data: { id: string; name: string | null }[] } | ProblemDetails
    >();
    type P = EndpointRouteGeneric<typeof getThing>;
    expectTypeOf<P["Params"]>().toEqualTypeOf<{ id: string }>();
    // A body-less 204 declares no Reply, so `reply.code(204).send()` type-checks.
    expectTypeOf<EndpointRouteGeneric<typeof deleteThing>>().toEqualTypeOf<{
      Params: { id: string };
    }>();
  });

  it("rejects a :param with no matching params key, and params keys with no :segment", () => {
    // @ts-expect-error — `:id` in the path but no `params` schema
    defineEndpoint({
      method: "GET",
      path: "/api/v1/things/:id",
      responses: { 200: { body: null } },
    });
    // @ts-expect-error — params key `thingId` does not match `:id`
    defineEndpoint({
      method: "GET",
      path: "/api/v1/things/:id",
      params: z.object({ thingId: z.string() }),
      responses: { 200: { body: null } },
    });
    // @ts-expect-error — params declared but the path has no `:segment`
    defineEndpoint({
      method: "GET",
      path: "/api/v1/things",
      params: z.object({ id: z.string() }),
      responses: { 200: { body: null } },
    });
  });

  it("rejects zero or several 2xx responses", () => {
    // @ts-expect-error — no 2xx response
    defineEndpoint({
      method: "GET",
      path: "/api/v1/things",
      responses: { 404: problem() },
    });
    // @ts-expect-error — two 2xx responses
    defineEndpoint({
      method: "GET",
      path: "/api/v1/things",
      responses: { 200: { body: null }, 201: { body: null } },
    });
  });
});
