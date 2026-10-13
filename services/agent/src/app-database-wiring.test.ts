import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * The shared behaviour (health body, degraded-on-DB-error, /ready semantics,
 * onClose -> shutdown) is covered once in @mbe/service-bootstrap. This only
 * pins what is service-specific: the public paths this service answers on and
 * that its own db is the one handed to createServiceApp (#6373).
 */
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

vi.mock("./services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response));

const { db, prisma } = await import("./services/database.js");
const { buildApp } = await import("./app.js");

describe("agent database wiring", () => {
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
    app = await buildApp({ logger: false });
    await app.ready();
  }, 30000);

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  it.each(["/health", "/api/gen/health"])(
    "serves the shared health response on %s",
    async (url) => {
      const res = await app!.inject({ method: "GET", url });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({ status: "ok", version: "unknown" });
    }
  );

  it("serves /ready backed by this service's database", async () => {
    const res = await app!.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).checks).toContainEqual(
      expect.objectContaining({ name: "database", status: "ok" })
    );
  });

  it("shuts this service's database down on close", async () => {
    await app!.close();
    app = undefined;
    expect(db.shutdown).toHaveBeenCalledTimes(1);
  });
});
