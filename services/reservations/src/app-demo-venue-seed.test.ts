import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * #9877: reservations-api seeds the public demo venue (`demo-bistro`) on production
 * start so every deploy self-heals it. Seeding runs from an onReady hook, is never
 * awaited by readiness, and a failure is logged and swallowed. Never under NODE_ENV=test.
 */
vi.mock("./services/database.js", async () => {
  const { createMockDatabaseModule } = await import("@mbe/database/testing");
  return createMockDatabaseModule();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

const { prisma } = await import("./services/database.js");
const { buildApp } = await import("./app.js");

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("demo venue seed on start (#9877)", () => {
  const ORIGINAL_ENV = process.env;
  let app: FastifyInstance | undefined;

  function setNodeEnv(nodeEnv: string): void {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: nodeEnv };
    process.env.AUTH_AUTHORITY = "https://example.us.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    process.env.MANAGE_TOKEN_SECRET = "test-manage-token-secret";
    process.env.SENTRY_DSN = "https://key@o1.ingest.sentry.io/2";
    delete process.env.REDIS_URL;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("seeds once with the app's own prisma client in production", async () => {
    setNodeEnv("production");
    const seed = vi.fn().mockResolvedValue({ ok: true, slug: "demo-bistro", venueId: "v1" });
    app = await buildApp({ logger: false, seedDemoVenue: seed });
    await app.ready();
    await flush();

    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed.mock.calls[0]?.[0]).toBe(prisma);
  });

  it("does not fail readiness when the seeder rejects", async () => {
    setNodeEnv("production");
    const seed = vi.fn().mockRejectedValue(new Error("db down"));
    app = await buildApp({ logger: false, seedDemoVenue: seed });

    await expect(app.ready()).resolves.toBeDefined();
    await flush();
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it("does not wait for a slow seeder before becoming ready", async () => {
    setNodeEnv("production");
    const seed = vi.fn().mockReturnValue(new Promise(() => undefined));
    app = await buildApp({ logger: false, seedDemoVenue: seed });

    await expect(app.ready()).resolves.toBeDefined();
  });

  it("does not seed under NODE_ENV=test", async () => {
    setNodeEnv("test");
    const seed = vi.fn().mockResolvedValue({ ok: true });
    app = await buildApp({ logger: false, seedDemoVenue: seed });
    await app.ready();
    await flush();

    expect(seed).not.toHaveBeenCalled();
  });

  it("does not seed in development", async () => {
    setNodeEnv("development");
    const seed = vi.fn().mockResolvedValue({ ok: true });
    app = await buildApp({ logger: false, seedDemoVenue: seed });
    await app.ready();
    await flush();

    expect(seed).not.toHaveBeenCalled();
  });
});
