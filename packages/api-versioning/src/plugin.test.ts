import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { getSunsetDate } from "../src/fastify.js";

const createApiVersioningPlugin = async (
  fastify: ReturnType<typeof Fastify>,
  options: {
    currentVersion: string;
    successorVersion?: string;
    sunsetMonthsFromNow?: number;
  }
) => {
  const { currentVersion, successorVersion, sunsetMonthsFromNow = 6 } = options;

  const sunsetDate = getSunsetDate(sunsetMonthsFromNow);

  fastify.addHook("onSend", async (request, reply) => {
    reply.header("API-Version", currentVersion);

    if (successorVersion) {
      const path = request.url.replace(/\/v\d+/, `/${successorVersion}`);
      reply.header("Link", `<${path}>; rel="successor-version"`);
    }
  });

  fastify.decorate("apiVersion", currentVersion);
  fastify.decorate("successorVersion", successorVersion);
  fastify.decorate("sunsetDate", sunsetDate);
};

describe("apiVersioning", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    fastify = Fastify();
  });

  afterEach(async () => {
    await fastify.close();
  });

  it("adds API-Version header to responses", async () => {
    await createApiVersioningPlugin(fastify, {
      currentVersion: "v1",
      successorVersion: "v2",
    });

    fastify.get("/v1/test", async () => ({ ok: true }));

    await fastify.ready();

    const response = await fastify.inject({
      method: "GET",
      url: "/v1/test",
    });

    expect(response.headers["api-version"]).toBe("v1");
    expect(response.headers["link"]).toBe('</v2/test>; rel="successor-version"');
  });

  it("decorates fastify with apiVersion, successorVersion, and sunsetDate", async () => {
    await createApiVersioningPlugin(fastify, {
      currentVersion: "v1",
      successorVersion: "v2",
      sunsetMonthsFromNow: 6,
    });

    await fastify.ready();

    expect((fastify as Record<string, unknown>)["apiVersion"]).toBe("v1");
    expect((fastify as Record<string, unknown>)["successorVersion"]).toBe("v2");
    expect((fastify as Record<string, unknown>)["sunsetDate"]).toBeDefined();
  });
});

describe("getSunsetDate", () => {
  it("returns a date 6 months in the future by default", () => {
    const sunsetDate = new Date(getSunsetDate(6));
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

    expect(sunsetDate.getMonth()).toBe(sixMonthsFromNow.getMonth());
  });

  it("returns a date 1 month in the future when specified", () => {
    const sunsetDate = new Date(getSunsetDate(1));
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

    expect(sunsetDate.getMonth()).toBe(oneMonthFromNow.getMonth());
  });
});
