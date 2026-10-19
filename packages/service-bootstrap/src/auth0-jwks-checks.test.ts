/**
 * Characterisation tests pinning the externally observable Auth0 JWKS
 * behaviour of `/health` and `/ready` at the createServiceApp interface.
 *
 * These exist so the two JWKS implementations (health.ts and observability's
 * readiness.ts) can be unified (#7105) without changing either endpoint. They
 * deliberately pin quirks too — notably that the two endpoints resolve the URL
 * with DIFFERENT precedence when AUTH0_JWKS_URL and AUTH_AUTHORITY disagree.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type * as ObservabilityModule from "@mbe/observability";
import { createServiceApp } from "./create-service-app.js";

vi.mock("@fastify/cors", () => ({ default: vi.fn().mockImplementation(async () => {}) }));
vi.mock("@fastify/rate-limit", async () => {
  const { default: fp } = await import("fastify-plugin");
  const mockPlugin = vi.fn().mockImplementation(async (fastify: FastifyInstance) => {
    fastify.decorate("rateLimit", () => async () => {});
  });
  return { default: fp(mockPlugin) };
});
vi.mock("@fastify/swagger", () => ({
  default: vi.fn().mockImplementation(async (fastify: FastifyInstance) => {
    fastify.decorate("swagger", () => ({
      openapi: "3.1.0",
      info: { title: "mock", version: "0.0.0" },
      paths: {},
    }));
  }),
}));
vi.mock("@fastify/swagger-ui", () => ({ default: vi.fn().mockImplementation(async () => {}) }));
vi.mock("@scalar/fastify-api-reference", () => ({
  default: vi.fn().mockImplementation(async () => {}),
}));
vi.mock("@mbe/auth/fastify", () => ({
  authPlugin: vi.fn().mockImplementation(async () => {}),
  getAuthPluginOptionsFromEnv: vi.fn(() => ({})),
}));
vi.mock("@mbe/observability", async (importOriginal) => {
  const actual = await importOriginal<typeof ObservabilityModule>();
  return {
    ...actual,
    createRequestIdMiddleware: vi.fn().mockReturnValue(vi.fn().mockImplementation(async () => {})),
    errorRatePlugin_: fp(
      vi.fn().mockImplementation(async (fastify: FastifyInstance) => {
        fastify.decorate("getErrorRates", () => ({ endpoints: [], degraded: false }));
      })
    ),
    createRateLimitMonitor: vi.fn().mockReturnValue({
      recordHit: vi.fn(),
      getSnapshot: vi.fn().mockReturnValue({
        stats: { hits_last_hour: 0, blocked_ips: 0 },
        isDegraded: false,
      }),
      reset: vi.fn(),
    }),
  };
});
vi.mock("@mbe/sentry/node", () => ({
  sentryFastifyPlugin: vi.fn().mockImplementation(async () => {}),
  captureRequestError: vi.fn(),
}));

// The dev-tenant URL literal lives in exactly one place (observability auth0-jwks.ts).
const DEV_URL = expect.stringMatching(
  /^https:\/\/dev-[a-z0-9]+\.us\.auth0\.com\/\.well-known\/jwks\.json$/
);
const AUTHORITY = "https://authority.example.com";
const AUTHORITY_JWKS = `${AUTHORITY}/.well-known/jwks.json`;
const EXPLICIT_JWKS = "https://explicit.example.com/.well-known/jwks.json";

function mockDb() {
  return {
    prisma: { $queryRaw: vi.fn().mockResolvedValue([]) },
    getSlowQueryStats: vi.fn().mockReturnValue({ count5min: 0, slowestMs: 0 }),
    getServiceStatus: vi.fn().mockReturnValue("ok"),
    getPoolMetrics: vi.fn().mockReturnValue({
      total: 5,
      busy: 1,
      idle: 4,
      waiting: 0,
      utilization: 0.2,
      isDegraded: false,
    }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = await createServiceApp(
    {
      swagger: { title: "T", description: "d", serverUrl: "http://localhost:9999" },
      database: {
        db: mockDb() as never,
        healthRoutes: [{ path: "/health", operationId: "getTestHealth" }],
      },
    },
    { logger: false }
  );
  await app.ready();
  return app;
}

const okResponse = { ok: true, status: 200 };

describe("Auth0 JWKS checks via createServiceApp", () => {
  let app: FastifyInstance | undefined;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.AUTH_AUTHORITY;
    delete process.env.AUTH_AUDIENCE;
    delete process.env.AUTH0_JWKS_URL;
    delete process.env.NODE_ENV;
    delete process.env.SENTRY_DSN;
  });

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  async function ready() {
    const res = await app!.inject({ method: "GET", url: "/ready" });
    const body = JSON.parse(res.body) as {
      ready: boolean;
      checks: { name: string; status: string; message?: string }[];
    };
    return { res, body, auth: body.checks.find((c) => c.name === "auth")! };
  }

  async function health() {
    const res = await app!.inject({ method: "GET", url: "/health" });
    const body = JSON.parse(res.body) as {
      status: string;
      checks: { auth0: { status: string; latency: number; message?: string } };
    };
    return { res, auth0: body.checks.auth0 };
  }

  describe("/ready", () => {
    it("is ready when the JWKS endpoint answers 200", async () => {
      const fetchMock = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = fetchMock as never;
      app = await buildApp();

      const { res, auth } = await ready();

      expect(res.statusCode).toBe(200);
      expect(auth).toEqual({ name: "auth", status: "ok" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[1]).toEqual({ signal: expect.any(AbortSignal) });
    });

    it("is not ready on a non-2xx answer, after exactly one retry ~50ms later", async () => {
      const times: number[] = [];
      const fetchMock = vi.fn().mockImplementation(async () => {
        times.push(Date.now());
        return { ok: false, status: 503 };
      });
      globalThis.fetch = fetchMock as never;
      app = await buildApp();

      const { res, body, auth } = await ready();

      expect(res.statusCode).toBe(503);
      expect(body.ready).toBe(false);
      expect(auth).toEqual({ name: "auth", status: "error", message: "JWKS returned 503" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(45);
    });

    it("is not ready when the endpoint is unreachable, reporting the raw error", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
      globalThis.fetch = fetchMock as never;
      app = await buildApp();

      const { res, auth } = await ready();

      expect(res.statusCode).toBe(503);
      expect(auth).toEqual({
        name: "auth",
        status: "error",
        message: "getaddrinfo ENOTFOUND",
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("recovers when the retry succeeds after one transient failure", async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error("blip"))
        .mockResolvedValueOnce(okResponse);
      globalThis.fetch = fetchMock as never;
      app = await buildApp();

      const { res, auth } = await ready();

      expect(res.statusCode).toBe(200);
      expect(auth.status).toBe("ok");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("resolves the URL once at registration, not per request", async () => {
      process.env.AUTH0_JWKS_URL = EXPLICIT_JWKS;
      const fetchMock = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = fetchMock as never;
      app = await buildApp();
      process.env.AUTH0_JWKS_URL = "https://changed.example.com/jwks.json";

      await ready();

      expect(fetchMock.mock.calls[0]?.[0]).toBe(EXPLICIT_JWKS);
    });

    it("looks up global fetch per call (a thunk), so a later stub is honoured", async () => {
      const first = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = first as never;
      app = await buildApp();
      const second = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = second as never;

      await ready();

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("probes AUTH_AUTHORITY's JWKS url first", async () => {
      process.env.AUTH_AUTHORITY = `${AUTHORITY}/`;
      process.env.AUTH0_JWKS_URL = EXPLICIT_JWKS;
      const fetchMock = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = fetchMock as never;
      app = await buildApp();

      await ready();

      expect(fetchMock.mock.calls[0]?.[0]).toBe(AUTHORITY_JWKS);
    });

    it("falls back to AUTH0_JWKS_URL, then the dev tenant", async () => {
      process.env.AUTH0_JWKS_URL = EXPLICIT_JWKS;
      const a = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = a as never;
      app = await buildApp();
      await ready();
      expect(a.mock.calls[0]?.[0]).toBe(EXPLICIT_JWKS);
      await app.close();

      delete process.env.AUTH0_JWKS_URL;
      const b = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = b as never;
      app = await buildApp();
      await ready();
      expect(b.mock.calls[0]?.[0]).toEqual(DEV_URL);
    });
  });

  describe("/health", () => {
    it("reports ok with a latency when the JWKS endpoint answers 200", async () => {
      const fetchMock = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = fetchMock as never;
      app = await buildApp();

      const { auth0 } = await health();

      expect(auth0.status).toBe("ok");
      expect(typeof auth0.latency).toBe("number");
      expect(auth0.message).toBeUndefined();
      expect(fetchMock.mock.calls[0]?.[0]).toEqual(DEV_URL);
    });

    it("reports degraded with the status code, without retrying", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502 });
      globalThis.fetch = fetchMock as never;
      app = await buildApp();

      const { res, auth0 } = await health();

      expect(res.statusCode).toBe(200);
      expect(auth0).toMatchObject({ status: "degraded", message: "Auth0 JWKS returned 502" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("reports unreachable with the raw error message, without retrying", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("socket hang up"));
      globalThis.fetch = fetchMock as never;
      app = await buildApp();

      const { auth0 } = await health();

      expect(auth0).toMatchObject({
        status: "degraded",
        message: "Auth0 JWKS unreachable: socket hang up",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("reports a timeout message when the request aborts", async () => {
      const abort = new Error("aborted");
      abort.name = "AbortError";
      globalThis.fetch = vi.fn().mockRejectedValue(abort) as never;
      app = await buildApp();

      const { auth0 } = await health();

      expect(auth0).toMatchObject({
        status: "degraded",
        message: "Auth0 JWKS unreachable (timeout >2s)",
      });
    });

    it("resolves the URL on every request and fetch per call", async () => {
      const first = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = first as never;
      app = await buildApp();
      await health();
      expect(first.mock.calls[0]?.[0]).toEqual(DEV_URL);

      const second = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = second as never;
      process.env.AUTH0_JWKS_URL = EXPLICIT_JWKS;
      await health();
      expect(second.mock.calls[0]?.[0]).toBe(EXPLICIT_JWKS);
    });

    it("probes AUTH0_JWKS_URL first, then AUTH_AUTHORITY, then the dev tenant", async () => {
      process.env.AUTH_AUTHORITY = AUTHORITY;
      process.env.AUTH0_JWKS_URL = EXPLICIT_JWKS;
      const fetchMock = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = fetchMock as never;
      app = await buildApp();

      await health();
      delete process.env.AUTH0_JWKS_URL;
      await health();
      delete process.env.AUTH_AUTHORITY;
      await health();

      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        EXPLICIT_JWKS,
        AUTHORITY_JWKS,
        DEV_URL,
      ]);
    });

    it("degrades without fetching in production when nothing is configured", async () => {
      const fetchMock = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = fetchMock as never;
      app = await buildApp();
      process.env.NODE_ENV = "production";

      const { auth0 } = await health();

      expect(auth0).toEqual({
        status: "degraded",
        latency: 0,
        message: "Auth0 JWKS not configured: set AUTH_AUTHORITY (or AUTH0_JWKS_URL)",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("known precedence mismatch (backlog seed — pinned, not fixed)", () => {
    it("/health probes AUTH0_JWKS_URL while /ready probes AUTH_AUTHORITY when they disagree", async () => {
      process.env.AUTH_AUTHORITY = AUTHORITY;
      process.env.AUTH0_JWKS_URL = EXPLICIT_JWKS;
      const fetchMock = vi.fn().mockResolvedValue(okResponse);
      globalThis.fetch = fetchMock as never;
      app = await buildApp();

      await health();
      await ready();

      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([EXPLICIT_JWKS, AUTHORITY_JWKS]);
    });
  });
});
