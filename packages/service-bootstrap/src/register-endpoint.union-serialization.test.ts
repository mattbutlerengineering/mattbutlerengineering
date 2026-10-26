import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { defineEndpoint, SeatingSchema, TonightPayloadSchema } from "@mbe/types";
import { registerEndpoint } from "./register-endpoint.js";

// #7722: the response schema strips `required`, so every branch of a union of
// objects used to match any object and fast-json-stringify serialised with the
// first branch, silently dropping the other branches' keys.
const getUnions = defineEndpoint({
  method: "GET",
  path: "/v1/unions",
  responses: {
    200: {
      description: "Unions",
      body: z.object({ data: z.object({ payload: TonightPayloadSchema }) }),
    },
  },
});

const getSeating = defineEndpoint({
  method: "GET",
  path: "/v1/seating",
  responses: {
    200: { description: "Seating", body: z.object({ data: SeatingSchema }) },
  },
});

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serialize(
  endpoint: typeof getUnions | typeof getSeating,
  data: unknown,
  url: string
): Promise<unknown> {
  const instance = Fastify();
  registerEndpoint(instance, endpoint as never, {
    docs: { summary: "S", operationId: "op", description: "D", tags: ["T"], security: [] },
    handler: async () => ({ data }) as never,
  });
  await instance.ready();
  app = instance;
  const res = await instance.inject({ method: "GET", url });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe("union branches survive response serialization (#7722)", () => {
  it.each([{ stop: { from: 0, to: 2880 } }, { closeAt: 1260 }, { pacing: { covers: 4 } }])(
    "keeps the Tonight payload %j",
    async (change) => {
      const payload = { version: 1, ...change };
      expect(await serialize(getUnions, { payload }, "/v1/unions")).toEqual({ data: { payload } });
    }
  );

  it.each([{ interval: 15 }, { fixed: [1080, 1140] }])("keeps the seating %j", async (change) => {
    const data = { version: 1, ...change };
    expect(await serialize(getSeating, data, "/v1/seating")).toEqual({ data });
  });
});
