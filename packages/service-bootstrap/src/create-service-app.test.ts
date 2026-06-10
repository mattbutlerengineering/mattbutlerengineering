import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createServiceApp,
  validateCorsOrigins,
  type ServiceAppConfig,
} from "./create-service-app.js";

// Mock all plugin dependencies so tests don't require real servers/auth
vi.mock("@fastify/cors", () => ({
  default: vi.fn().mockImplementation(async () => {}),
}));
vi.mock("@fastify/rate-limit", () => ({
  default: vi.fn().mockImplementation(async () => {}),
}));
vi.mock("@fastify/swagger", () => ({
  default: vi.fn().mockImplementation(async (fastify: FastifyInstance) => {
    fastify.decorate("swagger", () => ({}));
  }),
}));
vi.mock("@fastify/swagger-ui", () => ({
  default: vi.fn().mockImplementation(async () => {}),
}));
vi.mock("@scalar/fastify-api-reference", () => ({
  default: vi.fn().mockImplementation(async () => {}),
}));
vi.mock("@mbe/auth/fastify", () => ({
  authPlugin: vi.fn().mockImplementation(async () => {}),
  getAuthPluginOptionsFromEnv: vi.fn().mockReturnValue({}),
}));
vi.mock("@mbe/observability", () => ({
  createRequestIdMiddleware: vi.fn().mockReturnValue(vi.fn().mockImplementation(async () => {})),
  errorRatePlugin_: vi.fn().mockImplementation(async (fastify: FastifyInstance) => {
    fastify.decorate("getErrorRates", () => ({ endpoints: [], degraded: false }));
  }),
  createRateLimitMonitor: vi.fn().mockReturnValue({
    recordHit: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue({
      stats: { hits_last_hour: 0, blocked_ips: 0 },
      isDegraded: false,
    }),
    reset: vi.fn(),
  }),
}));
vi.mock("@mbe/sentry/node", () => ({
  sentryFastifyPlugin: vi.fn().mockImplementation(async () => {}),
}));
// NOTE: @mbe/api-versioning is inlined into createServiceApp — no mock needed.

/**
 * Helper to extract the options (second arg) from a mocked Fastify plugin call.
 * Fastify calls plugins with (fastify, opts, done), so opts is at index 1.
 */
function getPluginOpts(mockFn: ReturnType<typeof vi.fn>): unknown {
  return mockFn.mock.calls[0]?.[1];
}

function createTestConfig(overrides?: Partial<ServiceAppConfig>): ServiceAppConfig {
  return {
    swagger: {
      title: "Test API",
      description: "Test API description",
      serverUrl: "http://localhost:9999",
    },
    ...overrides,
  };
}

describe("createServiceApp", () => {
  let app: FastifyInstance;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env for each test
    delete process.env.AUTH_AUTHORITY;
    delete process.env.AUTH_AUDIENCE;
    delete process.env.CORS_ORIGINS;
    delete process.env.NODE_ENV;
    delete process.env.API_BASE_URL;
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("returns a Fastify instance", async () => {
    app = await createServiceApp(createTestConfig());
    expect(app).toBeDefined();
    expect(typeof app.inject).toBe("function");
  });

  it("disables request logging by default", async () => {
    app = await createServiceApp(createTestConfig());
    expect(app.initialConfig.disableRequestLogging).toBe(true);
  });

  it("uses strict false for AJV", async () => {
    app = await createServiceApp(createTestConfig());
    await app.ready();
    expect(app).toBeDefined();
  });

  it("registers CORS plugin", async () => {
    const cors = await import("@fastify/cors");
    app = await createServiceApp(createTestConfig());
    expect(cors.default).toHaveBeenCalled();
  });

  it("registers request-ID middleware", async () => {
    const obs = await import("@mbe/observability");
    app = await createServiceApp(createTestConfig());
    expect(obs.createRequestIdMiddleware).toHaveBeenCalled();
  });

  it("registers error rate plugin", async () => {
    const obs = await import("@mbe/observability");
    app = await createServiceApp(createTestConfig());
    expect(obs.errorRatePlugin_).toHaveBeenCalled();
  });

  it("decorates with rateLimitMonitor", async () => {
    app = await createServiceApp(createTestConfig());
    await app.ready();
    expect(app.hasDecorator("rateLimitMonitor")).toBe(true);
  });

  it("registers rate limit plugin", async () => {
    const rateLimit = await import("@fastify/rate-limit");
    app = await createServiceApp(createTestConfig());
    expect(rateLimit.default).toHaveBeenCalled();
  });

  it("registers swagger with config from ServiceAppConfig", async () => {
    const swagger = await import("@fastify/swagger");
    const config = createTestConfig({
      swagger: {
        title: "My Custom API",
        description: "Custom description",
        serverUrl: "http://localhost:4000",
      },
    });
    app = await createServiceApp(config);
    const opts = getPluginOpts(vi.mocked(swagger.default)) as Record<string, unknown>;
    const openapi = (
      opts as {
        openapi: { info: { title: string; description: string }; servers: { url: string }[] };
      }
    ).openapi;
    expect(openapi.info.title).toBe("My Custom API");
    expect(openapi.info.description).toBe("Custom description");
    expect(openapi.servers).toEqual([{ url: "http://localhost:4000" }]);
  });

  it("uses the origin of API_BASE_URL as the swagger server URL in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_AUTHORITY = "https://auth.example.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    process.env.API_BASE_URL = "https://api.example.com/api";
    const swagger = await import("@fastify/swagger");
    app = await createServiceApp(
      createTestConfig({
        swagger: {
          title: "My Custom API",
          description: "Custom description",
          serverUrl: "http://localhost:4000",
        },
      })
    );
    const opts = getPluginOpts(vi.mocked(swagger.default)) as {
      openapi: { servers: { url: string }[] };
    };
    expect(opts.openapi.servers).toEqual([{ url: "https://api.example.com" }]);
  });

  it("ignores API_BASE_URL outside production (agent service sets it to another port in dev)", async () => {
    process.env.NODE_ENV = "development";
    process.env.API_BASE_URL = "http://localhost:3000";
    const swagger = await import("@fastify/swagger");
    app = await createServiceApp(
      createTestConfig({
        swagger: {
          title: "My Custom API",
          description: "Custom description",
          serverUrl: "http://localhost:4000",
        },
      })
    );
    const opts = getPluginOpts(vi.mocked(swagger.default)) as {
      openapi: { servers: { url: string }[] };
    };
    expect(opts.openapi.servers).toEqual([{ url: "http://localhost:4000" }]);
  });

  it("falls back to the configured serverUrl when API_BASE_URL is malformed", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_AUTHORITY = "https://auth.example.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    process.env.API_BASE_URL = "not-a-valid-url";
    const swagger = await import("@fastify/swagger");
    app = await createServiceApp(
      createTestConfig({
        swagger: {
          title: "My Custom API",
          description: "Custom description",
          serverUrl: "http://localhost:4000",
        },
      })
    );
    const opts = getPluginOpts(vi.mocked(swagger.default)) as {
      openapi: { servers: { url: string }[] };
    };
    expect(opts.openapi.servers).toEqual([{ url: "http://localhost:4000" }]);
  });

  it("registers swagger-ui at /docs", async () => {
    const swaggerUi = await import("@fastify/swagger-ui");
    app = await createServiceApp(createTestConfig());
    const opts = getPluginOpts(vi.mocked(swaggerUi.default)) as { routePrefix: string };
    expect(opts.routePrefix).toBe("/docs");
  });

  it("registers Scalar API reference at /reference", async () => {
    const scalar = await import("@scalar/fastify-api-reference");
    app = await createServiceApp(createTestConfig());
    const opts = getPluginOpts(vi.mocked(scalar.default)) as { routePrefix: string };
    expect(opts.routePrefix).toBe("/reference");
  });

  it("registers auth plugin when AUTH_AUTHORITY and AUTH_AUDIENCE are set", async () => {
    process.env.AUTH_AUTHORITY = "https://auth.example.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    const auth = await import("@mbe/auth/fastify");
    app = await createServiceApp(createTestConfig());
    expect(auth.authPlugin).toHaveBeenCalled();
    expect(auth.getAuthPluginOptionsFromEnv).toHaveBeenCalled();
  });

  it("skips auth plugin when AUTH_AUTHORITY is not set in non-production", async () => {
    process.env.NODE_ENV = "development";
    const auth = await import("@mbe/auth/fastify");
    app = await createServiceApp(createTestConfig());
    expect(auth.authPlugin).not.toHaveBeenCalled();
  });

  it("throws in production when AUTH_AUTHORITY is not set", async () => {
    process.env.NODE_ENV = "production";
    await expect(createServiceApp(createTestConfig())).rejects.toThrow(
      "Fail-closed: AUTH_AUTHORITY and AUTH_AUDIENCE are required in production"
    );
  });

  it("registers Sentry plugin", async () => {
    const sentry = await import("@mbe/sentry/node");
    app = await createServiceApp(createTestConfig());
    expect(sentry.sentryFastifyPlugin).toHaveBeenCalled();
  });

  it("adds API-Version header to responses (inlined versioning)", async () => {
    app = await createServiceApp(createTestConfig(), { logger: false });
    app.get("/v1/ping", async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/ping" });
    expect(res.headers["api-version"]).toBe("v1");
  });

  it("adds Link successor-version header by default (v1 → v2)", async () => {
    app = await createServiceApp(createTestConfig(), { logger: false });
    app.get("/v1/items", async () => []);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/items" });
    expect(res.headers["link"]).toBe('</v2/items>; rel="successor-version"');
  });

  it("accepts custom logger option", async () => {
    app = await createServiceApp(createTestConfig(), { logger: false });
    expect(app).toBeDefined();
  });

  it("respects custom API versioning config in response headers", async () => {
    app = await createServiceApp(
      createTestConfig({
        apiVersioning: {
          currentVersion: "v2",
          successorVersion: "v3",
          sunsetMonthsFromNow: 12,
        },
      }),
      { logger: false }
    );
    app.get("/v2/items", async () => []);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v2/items" });
    expect(res.headers["api-version"]).toBe("v2");
    expect(res.headers["link"]).toBe('</v3/items>; rel="successor-version"');
  });

  it("decorates fastify instance with apiVersion after inlined versioning", async () => {
    app = await createServiceApp(createTestConfig(), { logger: false });
    await app.ready();
    expect(app.apiVersion).toBe("v1");
  });

  it("decorates fastify instance with sunsetDate after inlined versioning", async () => {
    app = await createServiceApp(createTestConfig(), { logger: false });
    await app.ready();
    expect(app.sunsetDate).toBeDefined();
    expect(new Date(app.sunsetDate).getTime()).toBeGreaterThan(Date.now());
  });

  it("addDeprecationHeaders sets Deprecation and Sunset headers", async () => {
    app = await createServiceApp(createTestConfig(), { logger: false });
    app.get("/v1/old", async (_req, reply) => {
      app.addDeprecationHeaders(reply);
      return { deprecated: true };
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/old" });
    expect(res.headers["deprecation"]).toBe("true");
    expect(res.headers["sunset"]).toMatch(/GMT/);
  });

  it("validates CORS origins from CORS_ORIGINS env var", async () => {
    process.env.CORS_ORIGINS = "https://mattbutlerengineering.com,https://evil.com";
    const cors = await import("@fastify/cors");
    app = await createServiceApp(createTestConfig());
    const opts = getPluginOpts(vi.mocked(cors.default)) as { origin: string[] };
    expect(opts.origin).toEqual(["https://mattbutlerengineering.com"]);
  });

  it("falls back to default origins when all env origins are rejected", async () => {
    process.env.CORS_ORIGINS = "https://evil.com";
    const cors = await import("@fastify/cors");
    app = await createServiceApp(createTestConfig());
    const opts = getPluginOpts(vi.mocked(cors.default)) as { origin: string[] };
    expect(opts.origin).toContain("https://mattbutlerengineering.com");
  });

  it("includes dev origins in development mode", async () => {
    process.env.NODE_ENV = "development";
    const cors = await import("@fastify/cors");
    app = await createServiceApp(createTestConfig());
    const opts = getPluginOpts(vi.mocked(cors.default)) as { origin: string[] };
    expect(opts.origin).toContain("http://localhost:3000");
    expect(opts.origin).toContain("http://localhost:5173");
  });

  it("does not include dev origins in production mode", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_AUTHORITY = "https://auth.example.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    const cors = await import("@fastify/cors");
    app = await createServiceApp(createTestConfig());
    const opts = getPluginOpts(vi.mocked(cors.default)) as { origin: string[] };
    expect(opts.origin).not.toContain("http://localhost:3000");
  });

  it("calls registerSchemas hook when provided", async () => {
    const registerSchemas = vi.fn();
    app = await createServiceApp(createTestConfig({ registerSchemas }));
    expect(registerSchemas).toHaveBeenCalledTimes(1);
    // The function receives a Fastify instance (may be encapsulated)
    const calledWith = registerSchemas.mock.calls[0]?.[0];
    expect(calledWith).toBeDefined();
    expect(typeof calledWith.addSchema).toBe("function");
  });

  it("does not fail when registerSchemas is not provided", async () => {
    app = await createServiceApp(createTestConfig());
    expect(app).toBeDefined();
  });

  it("rate limit onExceeded logs and records hit", async () => {
    const rateLimit = await import("@fastify/rate-limit");
    const obs = await import("@mbe/observability");
    app = await createServiceApp(createTestConfig());

    // Extract the onExceeded callback from the rate limit registration call
    const rateLimitOpts = getPluginOpts(vi.mocked(rateLimit.default)) as {
      onExceeded: (req: {
        ip: string;
        url: string;
        log: { warn: (...args: unknown[]) => void };
      }) => void;
    };
    const mockReq = {
      ip: "127.0.0.1",
      url: "/test",
      log: { warn: vi.fn() },
    };
    rateLimitOpts.onExceeded(mockReq);

    const monitor = vi.mocked(obs.createRateLimitMonitor).mock.results[0]?.value;
    expect(monitor.recordHit).toHaveBeenCalledWith("127.0.0.1", "/test");
    expect(mockReq.log.warn).toHaveBeenCalled();
  });
});

describe("validateCorsOrigins", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("accepts *.mattbutlerengineering.com origins", () => {
    const result = validateCorsOrigins([
      "https://mattbutlerengineering.com",
      "https://subdomain.mattbutlerengineering.com",
      "https://hospitality.mattbutlerengineering.com",
    ]);
    expect(result).toEqual([
      "https://mattbutlerengineering.com",
      "https://subdomain.mattbutlerengineering.com",
      "https://hospitality.mattbutlerengineering.com",
    ]);
  });

  it("rejects invalid origins", () => {
    const result = validateCorsOrigins(["https://evil.com", "https://attacker.io"]);
    expect(result).toEqual([]);
  });

  it("filters mixed valid/invalid — keeps only valid", () => {
    const result = validateCorsOrigins(["https://mattbutlerengineering.com", "https://evil.com"]);
    expect(result).toEqual(["https://mattbutlerengineering.com"]);
  });

  it("accepts localhost origins in development mode", () => {
    process.env.NODE_ENV = "development";
    const result = validateCorsOrigins(["http://localhost:3000", "http://localhost:5173"]);
    expect(result).toEqual(["http://localhost:3000", "http://localhost:5173"]);
  });

  it("rejects localhost origins outside development mode", () => {
    process.env.NODE_ENV = "production";
    const result = validateCorsOrigins(["http://localhost:3000"]);
    expect(result).toEqual([]);
  });

  it("trims whitespace from origins", () => {
    const result = validateCorsOrigins([" https://mattbutlerengineering.com "]);
    expect(result).toEqual(["https://mattbutlerengineering.com"]);
  });

  it("returns empty array for empty input", () => {
    const result = validateCorsOrigins([]);
    expect(result).toEqual([]);
  });
});

describe("feature flags plugin", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    vi.clearAllMocks();
  });

  it("decorates request.features so routes can check flags without header parsing", async () => {
    app = await createServiceApp({
      swagger: {
        title: "Test API",
        description: "Test API description",
        serverUrl: "http://localhost:9999",
      },
    });
    app.get("/flag-check", async (request) => ({
      enabled: request.features.check("enhanced-validation"),
    }));
    const res = await app.inject({
      method: "GET",
      url: "/flag-check",
      headers: {
        "x-feature-flags": '{"enhanced-validation":{"enabled":true,"percentage":100}}',
      },
    });
    expect(res.json()).toEqual({ enabled: true });
  });

  it("request.features reports flags disabled when no header is sent", async () => {
    app = await createServiceApp({
      swagger: {
        title: "Test API",
        description: "Test API description",
        serverUrl: "http://localhost:9999",
      },
    });
    app.get("/flag-check", async (request) => ({
      enabled: request.features.check("enhanced-validation"),
    }));
    const res = await app.inject({ method: "GET", url: "/flag-check" });
    expect(res.json()).toEqual({ enabled: false });
  });
});
