import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";

const { captureException, captureMessage, sentryNodeId } = await vi.hoisted(async () => {
  const sentryPkg = new URL("../../sentry/package.json", import.meta.url);
  const { pathToFileURL } = await import("node:url");
  const resolved = import.meta.resolve("@sentry/node", pathToFileURL(sentryPkg.pathname).href);
  return {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    sentryNodeId: new URL(resolved).pathname,
  };
});

// @sentry/node is a dependency of @mbe/sentry only, so under pnpm it is not
// resolvable as a bare id from here; mock the exact file @mbe/sentry resolves.
vi.mock(sentryNodeId, () => ({
  captureException,
  captureMessage,
  withScope: (fn: (scope: unknown) => void) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), setLevel: vi.fn() }),
  init: vi.fn(),
}));

import { sentryFastifyPlugin } from "@mbe/sentry/node";
import { errorHandlerPlugin } from "./error-handler.js";

// Registers both plugins in the order createServiceApp does.
async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(sentryFastifyPlugin);
  await app.register(errorHandlerPlugin);
  return app;
}

describe("error handling with Sentry enabled", () => {
  beforeEach(() => {
    vi.stubEnv("SENTRY_DSN", "https://key@sentry.io/123");
    captureException.mockClear();
    captureMessage.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("captures a thrown 5xx error as an exception exactly once, keeping the problem+json envelope", async () => {
    const app = await buildApp();
    const boom = new Error("db exploded");
    app.get("/boom", async () => {
      throw boom;
    });

    const res = await app.inject({ method: "GET", url: "/boom" });

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toMatchObject({ status: 500, instance: "/boom" });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(boom);
    // onResponse fallback must not double-capture the same failure
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("does not capture expected 4xx errors as exceptions", async () => {
    const app = await buildApp();
    app.get("/nf", async () => {
      throw Object.assign(new Error("nope"), { statusCode: 404 });
    });

    const res = await app.inject({ method: "GET", url: "/nf" });

    expect(res.statusCode).toBe(404);
    expect(captureException).not.toHaveBeenCalled();
  });
});
