import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Boot-level coverage for #4172: in production with REDIS_URL unset, buildApp()
 * must still resolve and the app must stay healthy — degraded (no job
 * scheduling), never a fatal crash. Mirrors notifier-runtime.test.ts's @mbe/jobs
 * mock so no real Redis connection is ever attempted, and additionally spies on
 * JobWorker construction to prove the in-process worker never starts.
 */
const jobSchedulerCtor = vi.fn();
const jobWorkerCtor = vi.fn();

vi.mock("@mbe/jobs", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  class FakeJobScheduler {
    constructor(config: { redisUrl: string }) {
      jobSchedulerCtor(config);
    }
    schedule = vi.fn().mockResolvedValue("job-1");
    cancel = vi.fn().mockResolvedValue(undefined);
  }
  class FakeJobWorker {
    constructor(config: unknown) {
      jobWorkerCtor(config);
    }
    close = vi.fn().mockResolvedValue(undefined);
  }
  return { ...actual, JobScheduler: FakeJobScheduler, JobWorker: FakeJobWorker };
});

vi.mock("./services/database.js", async () => {
  const { createMockDatabaseModule } = await import("@mbe/database/testing");
  return createMockDatabaseModule();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { prisma } = await import("./services/database.js");
const { buildApp } = await import("./app.js");

describe("buildApp() in production with REDIS_URL unset (#4172)", () => {
  const ORIGINAL_ENV = process.env;
  let app: FastifyInstance | undefined;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env.NODE_ENV = "production";
    process.env.AUTH_AUTHORITY = "https://example.us.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    process.env.MANAGE_TOKEN_SECRET = "test-manage-token-secret";
    delete process.env.REDIS_URL;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    process.env = ORIGINAL_ENV;
    errorSpy.mockRestore();
  });

  it("boots successfully and keeps /health serving traffic", async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
  });

  it("logs an error-level message naming REDIS_URL at startup", async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("REDIS_URL"));
  });

  it("never starts the job worker (no connection against a bogus URL)", async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    expect(jobWorkerCtor).not.toHaveBeenCalled();
    expect(jobSchedulerCtor).not.toHaveBeenCalled();
  });
});
