import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { defineEndpoint, AvailabilityDaySummarySchema } from "@mbe/types";
import { registerEndpoint } from "./register-endpoint.js";

// #7743: a closure's `bookingTypes` is optional on the wire. It must survive
// response serialization when present, and stay absent when the API omits it.
const getDays = defineEndpoint({
  method: "GET",
  path: "/v1/days",
  responses: {
    200: {
      description: "Days",
      body: z.object({ data: z.array(AvailabilityDaySummarySchema) }),
    },
  },
});

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const day = (closures: unknown[]) => ({
  serviceDate: "2026-11-06",
  label: "Regular",
  scheduleId: "sch-1",
  serviceCount: 1,
  closures,
  bookingOpen: { online: false, phone: true, waitlist: true },
});

async function serialize(data: unknown): Promise<unknown> {
  const instance = Fastify();
  registerEndpoint(instance, getDays as never, {
    docs: { summary: "S", operationId: "op", description: "D", tags: ["T"], security: [] },
    handler: async () => ({ data }) as never,
  });
  await instance.ready();
  app = instance;
  const res = await instance.inject({ method: "GET", url: "/v1/days" });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe("day summary closures survive response serialization (#7743)", () => {
  it("keeps bookingTypes on a booking closure", async () => {
    const data = [
      day([{ ruleId: "r", targetKind: "booking", from: 0, to: 2880, bookingTypes: ["online"] }]),
    ];
    expect(await serialize(data)).toEqual({ data });
  });

  it("leaves bookingTypes absent when the closure has none", async () => {
    const data = [day([{ ruleId: "r", targetKind: "venue", from: 0, to: 2880 }])];
    expect(await serialize(data)).toEqual({ data });
  });
});
