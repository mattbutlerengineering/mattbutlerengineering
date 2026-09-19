import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Regression coverage for #5469 (Sentry: "Cannot read properties of
 * undefined (reading 'getTracingHelper')" in reservations-api).
 *
 * `@mbe/database`'s `createDatabase()` registers its pg-pool/Prisma
 * `shutdown()` via `process.on("beforeExit", ...)`, but `startServiceServer`
 * (`@mbe/service-bootstrap`) always calls `process.exit(0)` at the end of its
 * SIGTERM/SIGINT handler — `beforeExit` never fires once `process.exit()` is
 * called, so the pg pool was never disconnected on a graceful shutdown. Every
 * rolling redeploy therefore tore the pool down by abrupt process
 * termination instead of Prisma's own graceful disconnect. `buildApp()` must
 * wire `db.shutdown()` into fastify's own `onClose` lifecycle — the same
 * mechanism already used for `lapsedGuestMonitor`/`jobWorker` — so it runs
 * deterministically after in-flight requests drain.
 */
vi.mock("./services/database.js", async () => {
  const { createMockDatabaseModule } = await import("@mbe/database/testing");
  return createMockDatabaseModule();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

const { db, prisma } = await import("./services/database.js");
const { buildApp } = await import("./app.js");

describe("buildApp() shutdown wiring (#5469)", () => {
  const ORIGINAL_ENV = process.env;
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env.AUTH_AUTHORITY = "https://example.us.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    process.env.MANAGE_TOKEN_SECRET = "test-manage-token-secret";
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
  });

  afterEach(async () => {
    if (app) await app.close().catch(() => undefined);
    app = undefined;
    process.env = ORIGINAL_ENV;
  });

  it("calls db.shutdown() when the app closes", async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    expect(db.shutdown).not.toHaveBeenCalled();

    await app.close();
    app = undefined;

    expect(db.shutdown).toHaveBeenCalledTimes(1);
  });
});
