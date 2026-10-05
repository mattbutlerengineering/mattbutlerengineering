import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance, type RouteOptions } from "fastify";
import { z } from "zod";
import {
  defineEndpoint,
  problem,
  GuestSchema,
  paginatedResponseSchema,
  guestJsonSchema,
  problemDetailsJsonSchema,
  type AnyEndpointDefinition,
} from "@mbe/types";
import { registerEndpoint } from "./register-endpoint.js";

const getThing = defineEndpoint({
  method: "GET",
  path: "/v1/things/:id",
  params: z.object({ id: z.string().describe("Thing ID") }),
  responses: {
    200: { description: "Thing found", body: z.object({ data: GuestSchema }) },
    404: problem("Thing not found"),
  },
});

const listThings = defineEndpoint({
  method: "GET",
  path: "/v1/things",
  query: z.object({ venueId: z.string(), page: z.string().default("1") }),
  responses: {
    200: { description: "Paginated things", body: paginatedResponseSchema(GuestSchema) },
    401: problem("Authentication required"),
  },
});

const deleteThing = defineEndpoint({
  method: "DELETE",
  path: "/v1/things/:id",
  params: z.object({ id: z.string() }),
  responses: { 204: { description: "Thing deleted", body: null }, 409: problem() },
});

const lapsingThings = defineEndpoint({
  method: "POST",
  path: "/v1/things/:id/notes",
  params: z.object({ id: z.string() }),
  body: z.object({ text: z.string() }),
  responses: {
    201: { body: z.object({ data: z.object({ email: z.string().nullable() }) }) },
  },
});

const docs = {
  summary: "S",
  operationId: "op",
  description: "D",
  tags: ["Things"],
  security: [{ bearerAuth: [] }],
};

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Boot a bare Fastify with the shared schemas, capturing every registered route. */
async function boot(
  register: (instance: FastifyInstance) => void,
  prefix = "/v1/things"
): Promise<{ app: FastifyInstance; routes: RouteOptions[] }> {
  const routes: RouteOptions[] = [];
  const instance = Fastify();
  instance.addSchema(guestJsonSchema);
  instance.addSchema({ ...problemDetailsJsonSchema, $id: "Error" });
  instance.addHook("onRoute", (route) => {
    // Fastify mutates the options object after onRoute (e.g. the trailing-slash
    // twin of a "/" route) and tags schemas with a symbol — snapshot plain data.
    routes.push({ ...route, schema: JSON.parse(JSON.stringify(route.schema ?? {})) });
  });
  await instance.register(
    async (plugin) => {
      register(plugin);
    },
    { prefix }
  );
  await instance.ready();
  app = instance;
  return { app: instance, routes };
}

describe("registerEndpoint", () => {
  it("registers the route at the prefix-relative URL with the derived schema and merged docs", async () => {
    const { routes } = await boot((f) =>
      registerEndpoint(f, getThing, { docs, handler: async () => ({ data: {} as never }) })
    );
    const route = routes.find((r) => r.method === "GET")!;
    expect(route.url).toBe("/v1/things/:id");
    expect(route.schema).toEqual({
      ...docs,
      params: {
        type: "object",
        properties: { id: { type: "string", description: "Thing ID" } },
        required: ["id"],
      },
      response: {
        200: {
          description: "Thing found",
          type: "object",
          properties: { data: { $ref: "Guest#" } },
        },
        404: { description: "Thing not found", $ref: "Error#" },
      },
    });
  });

  it("derives a paginated list with querystring exactly as createListResponseSchema did", async () => {
    const { routes } = await boot((f) =>
      registerEndpoint(f, listThings, {
        docs,
        handler: async () => ({ data: [], pagination: {} as never }),
      })
    );
    // "/" inside a prefixed plugin — the same registration as today's `fastify.get("/")`.
    const route = routes.find((r) => r.method === "GET")!;
    expect(route.schema).toMatchObject({
      querystring: {
        type: "object",
        properties: { venueId: { type: "string" }, page: { type: "string", default: "1" } },
        required: ["venueId", "page"],
      },
      response: {
        200: {
          description: "Paginated things",
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "Guest#" } },
            pagination: { type: "object" },
          },
        },
        401: { description: "Authentication required", $ref: "Error#" },
      },
    });
  });

  it("emits a 204 as type null and a description-less problem as a bare Error# ref", async () => {
    const { routes } = await boot((f) =>
      registerEndpoint(f, deleteThing, {
        docs,
        handler: async (_req, reply) => reply.code(204).send(),
      })
    );
    const route = routes.find((r) => r.method === "DELETE")!;
    expect((route.schema as Record<string, unknown>).response).toEqual({
      204: { description: "Thing deleted", type: "null" },
      409: { $ref: "Error#" },
    });
  });

  it("emits a body schema and a nullable inline response field", async () => {
    const { routes } = await boot((f) =>
      registerEndpoint(f, lapsingThings, {
        docs,
        handler: async (_req, reply) => reply.code(201).send({ data: { email: null } }),
      })
    );
    const schema = routes.find((r) => r.method === "POST")!.schema as Record<string, unknown>;
    expect(schema.body).toEqual({
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    });
    expect(schema.response).toEqual({
      201: {
        type: "object",
        properties: {
          data: { type: "object", properties: { email: { type: "string", nullable: true } } },
        },
      },
    });
  });

  it("hands the handler typed params, querystring (defaults applied) and body, and runs preHandlers", async () => {
    const seen: unknown[] = [];
    const { app: instance } = await boot((f) => {
      registerEndpoint(f, listThings, {
        docs,
        preHandler: [
          async (request) => {
            seen.push(`pre:${request.query.venueId}`);
          },
        ],
        handler: async (request) => {
          const page: string = request.query.page;
          seen.push(page);
          return {
            data: [],
            pagination: {
              page: 1,
              limit: 10,
              total: 0,
              totalPages: 0,
              hasNext: false,
              hasPrev: false,
            },
          };
        },
      });
      registerEndpoint(f, lapsingThings, {
        docs,
        handler: async (request, reply) => {
          const text: string = request.body.text;
          const id: string = request.params.id;
          seen.push(`${id}:${text}`);
          return reply.code(201).send({ data: { email: null } });
        },
      });
    });
    const list = await instance.inject({ method: "GET", url: "/v1/things?venueId=v1" });
    expect(list.statusCode).toBe(200);
    const note = await instance.inject({
      method: "POST",
      url: "/v1/things/t1/notes",
      payload: { text: "hi" },
    });
    expect(note.statusCode).toBe(201);
    expect(note.json()).toEqual({ data: { email: null } });
    const invalid = await instance.inject({
      method: "POST",
      url: "/v1/things/t1/notes",
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);
    expect(seen).toEqual(["pre:v1", "1", "t1:hi"]);
  });

  it("throws at registration when the definition's path is not under the plugin prefix", async () => {
    await expect(
      boot(
        (f) =>
          registerEndpoint(f, getThing, { docs, handler: async () => ({ data: {} as never }) }),
        "/v1/guests"
      )
    ).rejects.toThrow(/not under the plugin prefix "\/v1\/guests"/);
    await expect(
      boot(
        (f) =>
          registerEndpoint(f, getThing, { docs, handler: async () => ({ data: {} as never }) }),
        "/v1/thing"
      )
    ).rejects.toThrow(/not under the plugin prefix/);
  });

  it("throws at registration when there is not exactly one 2xx response", async () => {
    const twoSuccesses = {
      method: "GET",
      path: "/v1/things",
      responses: { 200: { body: null }, 201: { body: null } },
    } as unknown as AnyEndpointDefinition;
    await expect(
      boot((f) =>
        registerEndpoint(f, twoSuccesses, { docs, handler: async () => undefined as never })
      )
    ).rejects.toThrow(/exactly one 2xx/);
  });

  it("throws at registration when a params key has no :segment in the path", async () => {
    const mismatched = {
      method: "GET",
      path: "/v1/things/:id",
      params: z.object({ thingId: z.string() }),
      responses: { 200: { body: null } },
    } as unknown as AnyEndpointDefinition;
    await expect(
      boot((f) =>
        registerEndpoint(f, mismatched, { docs, handler: async () => undefined as never })
      )
    ).rejects.toThrow(/params keys \[thingId\] do not match path segments \[id\]/);
  });
});
