import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { createFeatureContext, createFeatureFlagsPlugin } from "./feature-flags.js";

describe("createFeatureContext", () => {
  describe("header parsing", () => {
    it("should parse valid JSON header", () => {
      const ctx = createFeatureContext('{"test-flag":{"enabled":true,"percentage":100}}');
      expect(ctx.check("test-flag")).toBe(true);
    });

    it("should handle null header", () => {
      const ctx = createFeatureContext(null);
      expect(ctx.check("any-flag")).toBe(false);
    });

    it("should handle undefined header", () => {
      const ctx = createFeatureContext(undefined);
      expect(ctx.check("any-flag")).toBe(false);
    });

    it("should handle invalid JSON", () => {
      const ctx = createFeatureContext("not-json");
      expect(ctx.check("any-flag")).toBe(false);
    });
  });

  describe("check", () => {
    it("should return true when flag is enabled with 100%", () => {
      const ctx = createFeatureContext('{"test-flag":{"enabled":true,"percentage":100}}');
      expect(ctx.check("test-flag")).toBe(true);
    });

    it("should return false when flag is disabled", () => {
      const ctx = createFeatureContext('{"test-flag":{"enabled":false,"percentage":100}}');
      expect(ctx.check("test-flag")).toBe(false);
    });

    it("should return false for missing flag", () => {
      const ctx = createFeatureContext("{}");
      expect(ctx.check("missing-flag")).toBe(false);
    });

    it("should return false for low percentage without seed", () => {
      const ctx = createFeatureContext('{"test-flag":{"enabled":true,"percentage":50}}');
      expect(ctx.check("test-flag")).toBe(false);
    });
  });

  describe("checkForUser", () => {
    it("should return true when flag is enabled with 100%", () => {
      const ctx = createFeatureContext('{"test-flag":{"enabled":true,"percentage":100}}');
      expect(ctx.checkForUser("test-flag", "user-123")).toBe(true);
    });

    it("should return false when flag is disabled", () => {
      const ctx = createFeatureContext('{"test-flag":{"enabled":false,"percentage":100}}');
      expect(ctx.checkForUser("test-flag", "user-123")).toBe(false);
    });

    it("should return consistent results for same seed", () => {
      const ctx = createFeatureContext('{"test-flag":{"enabled":true,"percentage":50}}');
      const result1 = ctx.checkForUser("test-flag", "consistent-user");
      const result2 = ctx.checkForUser("test-flag", "consistent-user");
      expect(result1).toBe(result2);
    });

    it("should distribute roughly evenly at 50%", () => {
      const ctx = createFeatureContext('{"test-flag":{"enabled":true,"percentage":50}}');
      let enabledCount = 0;
      const total = 1000;
      for (let i = 0; i < total; i++) {
        if (ctx.checkForUser("test-flag", `user-${i}`)) {
          enabledCount++;
        }
      }
      const percentage = (enabledCount / total) * 100;
      expect(percentage).toBeGreaterThan(40);
      expect(percentage).toBeLessThan(60);
    });

    it("should return false for empty seed", () => {
      const ctx = createFeatureContext('{"test-flag":{"enabled":true,"percentage":50}}');
      expect(ctx.checkForUser("test-flag", "")).toBe(false);
    });

    it("should return false for zero percentage", () => {
      const ctx = createFeatureContext('{"test-flag":{"enabled":true,"percentage":0}}');
      expect(ctx.checkForUser("test-flag", "user-123")).toBe(false);
    });
  });
});

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
