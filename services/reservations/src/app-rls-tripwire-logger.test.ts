import { describe, it, expect, vi, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type * as RlsContextMode from "./services/rls-context-mode.js";

/**
 * ADR-026 §3.3 / #5369 PR 1: `recordUnscopedRlsQuery` (`services/rls-context-mode.ts`)
 * defaults to a no-op logger so the module can be imported before any fastify
 * app exists. Production's `warn` mode is only real shadow telemetry if
 * `buildApp()` wires the app's actual (pino) logger in at bootstrap — this
 * proves that wiring directly, rather than trying to trigger a real unscoped
 * query end-to-end through a fully-built app.
 */
vi.mock("./services/database.js", async () => {
  const { createMockDatabaseModule } = await import("@mbe/database/testing");
  return createMockDatabaseModule();
});

vi.mock("./services/rls-context-mode.js", async (importOriginal) => {
  const actual = await importOriginal<typeof RlsContextMode>();
  return { ...actual, setRlsTripwireLogger: vi.fn() };
});

const { setRlsTripwireLogger } = await import("./services/rls-context-mode.js");
const { buildApp } = await import("./app.js");

describe("buildApp() RLS tripwire logger wiring (#5369 PR 1)", () => {
  const ORIGINAL_ENV = process.env;
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close().catch(() => undefined);
    app = undefined;
    process.env = ORIGINAL_ENV;
  });

  it("wires the app's own fastify logger into the RLS unscoped-query tripwire", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      MANAGE_TOKEN_SECRET: "test-manage-token-secret",
    };

    app = await buildApp({ logger: false });

    expect(setRlsTripwireLogger).toHaveBeenCalledTimes(1);
    expect(setRlsTripwireLogger).toHaveBeenCalledWith(app.log);
  });
});
