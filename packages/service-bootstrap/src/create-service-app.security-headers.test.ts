import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServiceApp, type ServiceAppConfig } from "./create-service-app.js";

function testConfig(): ServiceAppConfig {
  return {
    swagger: {
      title: "Test API",
      description: "Test API description",
      serverUrl: "http://localhost:9999",
    },
  };
}

const EXPECTED = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

describe("createServiceApp — baseline security headers", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("sets the four headers on a successful response", async () => {
    app = await createServiceApp(testConfig(), { logger: false });
    app.get("/ok", async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/ok" });

    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject(EXPECTED);
  });

  it("sets the four headers on a 404 response", async () => {
    app = await createServiceApp(testConfig(), { logger: false });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/v1/nonexistent-path-xyz" });

    expect(res.statusCode).toBe(404);
    expect(res.headers).toMatchObject(EXPECTED);
  });

  it("sets the four headers on a thrown-error response", async () => {
    app = await createServiceApp(testConfig(), { logger: false });
    app.get("/boom", async () => {
      throw new Error("boom");
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/boom" });

    expect(res.statusCode).toBe(500);
    expect(res.headers).toMatchObject(EXPECTED);
  });

  it("leaves CORS untouched: no allow-origin for a foreign origin", async () => {
    app = await createServiceApp(testConfig(), { logger: false });
    app.get("/ok", async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/ok",
      headers: { origin: "https://evil.example" },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
