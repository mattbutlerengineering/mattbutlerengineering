import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { createFeatureFlagsPlugin } from "./plugin.js";

const FLAG_HEADER = '{"enhanced-validation":{"enabled":true,"percentage":100}}';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(createFeatureFlagsPlugin());
  app.get("/check", async (request) => ({
    enabled: request.features.check("enhanced-validation"),
  }));
  app.get("/check-user", async (request) => ({
    enabled: request.features.checkForUser("enhanced-validation", "user-123"),
  }));
  return app;
}

describe("createFeatureFlagsPlugin", () => {
  it("decorates request.features and evaluates flags from the header", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/check",
      headers: { "x-feature-flags": FLAG_HEADER },
    });
    expect(res.json()).toEqual({ enabled: true });
  });

  it("returns false for all flags when the header is missing", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/check" });
    expect(res.json()).toEqual({ enabled: false });
  });

  it("returns false for all flags when the header is invalid JSON", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/check",
      headers: { "x-feature-flags": "not-json" },
    });
    expect(res.json()).toEqual({ enabled: false });
  });

  it("degrades to disabled flags when the header is sent multiple times", async () => {
    // Node joins repeated headers into a comma-separated string, which is
    // not valid JSON — flags disable gracefully instead of throwing
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/check",
      headers: { "x-feature-flags": [FLAG_HEADER, "{}"] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ enabled: false });
  });

  it("exposes checkForUser for percentage rollouts", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/check-user",
      headers: {
        "x-feature-flags": '{"enhanced-validation":{"enabled":true,"percentage":100}}',
      },
    });
    expect(res.json()).toEqual({ enabled: true });
  });
});
