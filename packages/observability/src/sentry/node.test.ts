import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSentryInit, mockWithScope, mockCaptureException, mockCaptureMessage } = vi.hoisted(
  () => ({
    mockSentryInit: vi.fn(),
    mockWithScope: vi.fn(),
    mockCaptureException: vi.fn(),
    mockCaptureMessage: vi.fn(),
  }),
);

vi.mock("@sentry/node", () => ({
  init: mockSentryInit,
  withScope: mockWithScope,
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
}));

vi.mock("@mbe/types", () => ({
  createProblemDetails: vi.fn(
    (status: number, title: string, message: string, type: string, instance: string) => ({
      status,
      title,
      detail: message,
      type,
      instance,
    }),
  ),
}));

import { initSentry } from "./node.js";

// Helper to build a fake Fastify instance for plugin testing
function buildFakeFastify() {
  const hooks: Record<string, ((...args: unknown[]) => unknown)[]> = {};
  let errorHandler: ((err: unknown, req: unknown, reply: unknown) => void) | null = null;

  const fastify = {
    addHook: vi.fn((hookName: string, fn: (...args: unknown[]) => unknown) => {
      hooks[hookName] = hooks[hookName] ?? [];
      hooks[hookName].push(fn);
    }),
    setErrorHandler: vi.fn((fn: (err: unknown, req: unknown, reply: unknown) => void) => {
      errorHandler = fn;
    }),
    getErrorHandler: () => errorHandler,
    getHook: (name: string) => hooks[name] ?? [],
  };

  return fastify;
}

function buildFakeRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: "GET",
    url: "/api/v1/test",
    id: "req-123",
    headers: {},
    ...overrides,
  };
}

function buildFakeReply(statusCode = 200) {
  const reply = {
    statusCode,
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    __sentryErrorCaptured: false,
  };
  return reply;
}

describe("initSentry (node)", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv.SENTRY_DSN = process.env.SENTRY_DSN;
    savedEnv.NODE_ENV = process.env.NODE_ENV;
    savedEnv.SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT;
    delete process.env.SENTRY_DSN;
    delete process.env.NODE_ENV;
    delete process.env.SENTRY_ENVIRONMENT;
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("does NOT call Sentry.init when SENTRY_DSN is unset", () => {
    initSentry({ serviceName: "my-service" });
    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it("does NOT call Sentry.init when SENTRY_DSN is empty string", () => {
    process.env.SENTRY_DSN = "";
    initSentry({ serviceName: "my-service" });
    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it("calls Sentry.init with correct config when DSN is set", () => {
    process.env.SENTRY_DSN = "https://key@sentry.io/123";
    process.env.NODE_ENV = "production";

    initSentry({ serviceName: "my-service" });

    expect(mockSentryInit).toHaveBeenCalledTimes(1);
    const callArg = mockSentryInit.mock.calls[0][0];
    expect(callArg.dsn).toBe("https://key@sentry.io/123");
    expect(callArg.serverName).toBe("my-service");
    expect(callArg.environment).toBe("production");
    expect(callArg.skipOpenTelemetrySetup).toBe(true);
    expect(callArg.tracesSampleRate).toBe(0);
  });
});

describe("sentryFastifyPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function setupPlugin(dsn: string | undefined) {
    // We dynamically re-import to get a fresh reference each time for env isolation
    vi.stubEnv("SENTRY_DSN", dsn ?? "");
    const { sentryFastifyPlugin } = await import("./node.js");
    const fakeFastify = buildFakeFastify();

    // The plugin is wrapped by fastify-plugin; call the inner fn directly
    await (sentryFastifyPlugin as unknown as (f: typeof fakeFastify) => Promise<void>)(fakeFastify);

    return fakeFastify;
  }

  it("registers no hooks when DSN is not set", async () => {
    const fakeFastify = await setupPlugin(undefined);
    expect(fakeFastify.setErrorHandler).not.toHaveBeenCalled();
    expect(fakeFastify.addHook).not.toHaveBeenCalled();
  });

  it("sets an error handler when DSN is configured", async () => {
    const fakeFastify = await setupPlugin("https://key@sentry.io/123");
    expect(fakeFastify.setErrorHandler).toHaveBeenCalledTimes(1);
  });

  it("registers an onResponse hook when DSN is configured", async () => {
    const fakeFastify = await setupPlugin("https://key@sentry.io/123");
    expect(fakeFastify.addHook).toHaveBeenCalledWith("onResponse", expect.any(Function));
  });

  describe("error handler", () => {
    it("captures exception with Sentry and sends problem details response", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const errorHandler = fakeFastify.getErrorHandler()!;

      const fakeScope = {
        setTag: vi.fn(),
        setUser: vi.fn(),
        setLevel: vi.fn(),
      };
      mockWithScope.mockImplementation((fn: (scope: typeof fakeScope) => void) => fn(fakeScope));

      const error = Object.assign(new Error("Something broke"), { statusCode: 500 });
      const request = buildFakeRequest();
      const reply = buildFakeReply(500);

      errorHandler(error, request, reply);

      expect(mockWithScope).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(error);
    });

    it("sets scope tags from request", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const errorHandler = fakeFastify.getErrorHandler()!;

      const fakeScope = {
        setTag: vi.fn(),
        setUser: vi.fn(),
        setLevel: vi.fn(),
      };
      mockWithScope.mockImplementation((fn: (scope: typeof fakeScope) => void) => fn(fakeScope));

      const error = Object.assign(new Error("Boom"), { statusCode: 500 });
      const request = buildFakeRequest({ method: "POST", url: "/api/v1/things", id: "rid-1" });
      const reply = buildFakeReply(500);

      errorHandler(error, request, reply);

      expect(fakeScope.setTag).toHaveBeenCalledWith("method", "POST");
      expect(fakeScope.setTag).toHaveBeenCalledWith("url", "/api/v1/things");
      expect(fakeScope.setTag).toHaveBeenCalledWith("requestId", "rid-1");
    });

    it("sets user context when request.user has id", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const errorHandler = fakeFastify.getErrorHandler()!;

      const fakeScope = {
        setTag: vi.fn(),
        setUser: vi.fn(),
        setLevel: vi.fn(),
      };
      mockWithScope.mockImplementation((fn: (scope: typeof fakeScope) => void) => fn(fakeScope));

      const error = Object.assign(new Error("Boom"), { statusCode: 403 });
      const request = buildFakeRequest({ user: { id: "user-42", email: "a@b.com" } });
      const reply = buildFakeReply(403);

      errorHandler(error, request, reply);

      expect(fakeScope.setUser).toHaveBeenCalledWith({ id: "user-42", email: "a@b.com" });
    });

    it("does NOT set user context when request.user is absent", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const errorHandler = fakeFastify.getErrorHandler()!;

      const fakeScope = {
        setTag: vi.fn(),
        setUser: vi.fn(),
        setLevel: vi.fn(),
      };
      mockWithScope.mockImplementation((fn: (scope: typeof fakeScope) => void) => fn(fakeScope));

      const error = Object.assign(new Error("Boom"), { statusCode: 500 });
      const request = buildFakeRequest();
      const reply = buildFakeReply(500);

      errorHandler(error, request, reply);

      expect(fakeScope.setUser).not.toHaveBeenCalled();
    });

    it("marks reply as __sentryErrorCaptured to prevent double capture", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const errorHandler = fakeFastify.getErrorHandler()!;

      mockWithScope.mockImplementation((fn: (scope: unknown) => void) => fn({ setTag: vi.fn(), setUser: vi.fn() }));

      const error = Object.assign(new Error("Boom"), { statusCode: 500 });
      const request = buildFakeRequest();
      const reply = buildFakeReply(500) as Record<string, unknown>;

      errorHandler(error, request, reply);

      expect(reply.__sentryErrorCaptured).toBe(true);
    });

    it("replies with 500 and obscured message for 5xx errors", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const errorHandler = fakeFastify.getErrorHandler()!;

      mockWithScope.mockImplementation((fn: (scope: unknown) => void) => fn({ setTag: vi.fn(), setUser: vi.fn() }));

      const error = Object.assign(new Error("DB connection failed"), { statusCode: 500 });
      const request = buildFakeRequest();
      const reply = buildFakeReply(500);

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      // The actual message should be obscured for 5xx
      const sentPayload = reply.send.mock.calls[0][0];
      expect(sentPayload.detail).toBe("Internal Server Error");
    });

    it("replies with original message for 4xx errors", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const errorHandler = fakeFastify.getErrorHandler()!;

      mockWithScope.mockImplementation((fn: (scope: unknown) => void) => fn({ setTag: vi.fn(), setUser: vi.fn() }));

      const error = Object.assign(new Error("Resource not found"), {
        statusCode: 404,
        name: "NotFoundError",
      });
      const request = buildFakeRequest();
      const reply = buildFakeReply(404);

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      const sentPayload = reply.send.mock.calls[0][0];
      expect(sentPayload.detail).toBe("Resource not found");
    });

    it("defaults to 500 when error has no statusCode", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const errorHandler = fakeFastify.getErrorHandler()!;

      mockWithScope.mockImplementation((fn: (scope: unknown) => void) => fn({ setTag: vi.fn(), setUser: vi.fn() }));

      const error = new Error("Unexpected");
      const request = buildFakeRequest();
      const reply = buildFakeReply(500);

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
    });
  });

  describe("onResponse hook", () => {
    it("captures 5xx as message when not already captured by error handler", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const onResponseHooks = fakeFastify.getHook("onResponse");
      const hook = onResponseHooks[0];

      const fakeScope = {
        setTag: vi.fn(),
        setUser: vi.fn(),
        setLevel: vi.fn(),
      };
      mockWithScope.mockImplementation((fn: (scope: typeof fakeScope) => void) => fn(fakeScope));

      const request = buildFakeRequest({ method: "GET", url: "/api/v1/fail" });
      const reply = buildFakeReply(503);

      await hook(request, reply);

      expect(mockWithScope).toHaveBeenCalled();
      expect(mockCaptureMessage).toHaveBeenCalledWith("HTTP 503: GET /api/v1/fail");
      expect(fakeScope.setLevel).toHaveBeenCalledWith("error");
    });

    it("does NOT double-capture 5xx when __sentryErrorCaptured is true", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const onResponseHooks = fakeFastify.getHook("onResponse");
      const hook = onResponseHooks[0];

      const request = buildFakeRequest();
      const reply = { ...buildFakeReply(500), __sentryErrorCaptured: true };

      await hook(request, reply);

      expect(mockCaptureMessage).not.toHaveBeenCalled();
    });

    it("captures notable 4xx (409) as warning", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const onResponseHooks = fakeFastify.getHook("onResponse");
      const hook = onResponseHooks[0];

      const fakeScope = {
        setTag: vi.fn(),
        setUser: vi.fn(),
        setLevel: vi.fn(),
      };
      mockWithScope.mockImplementation((fn: (scope: typeof fakeScope) => void) => fn(fakeScope));

      const request = buildFakeRequest({ method: "POST", url: "/api/v1/bookings" });
      const reply = buildFakeReply(409);

      await hook(request, reply);

      expect(mockCaptureMessage).toHaveBeenCalledWith("HTTP 409: POST /api/v1/bookings");
      expect(fakeScope.setLevel).toHaveBeenCalledWith("warning");
    });

    it("captures notable 4xx (422) as warning", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const onResponseHooks = fakeFastify.getHook("onResponse");
      const hook = onResponseHooks[0];

      const fakeScope = {
        setTag: vi.fn(),
        setUser: vi.fn(),
        setLevel: vi.fn(),
      };
      mockWithScope.mockImplementation((fn: (scope: typeof fakeScope) => void) => fn(fakeScope));

      const request = buildFakeRequest({ url: "/api/v1/validate" });
      const reply = buildFakeReply(422);

      await hook(request, reply);

      expect(fakeScope.setLevel).toHaveBeenCalledWith("warning");
    });

    it("captures notable 4xx (429) as warning", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const onResponseHooks = fakeFastify.getHook("onResponse");
      const hook = onResponseHooks[0];

      const fakeScope = {
        setTag: vi.fn(),
        setUser: vi.fn(),
        setLevel: vi.fn(),
      };
      mockWithScope.mockImplementation((fn: (scope: typeof fakeScope) => void) => fn(fakeScope));

      const request = buildFakeRequest({ url: "/api/v1/rate" });
      const reply = buildFakeReply(429);

      await hook(request, reply);

      expect(fakeScope.setLevel).toHaveBeenCalledWith("warning");
    });

    it("does NOT capture expected 4xx errors (400, 401, 403, 404)", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const onResponseHooks = fakeFastify.getHook("onResponse");
      const hook = onResponseHooks[0];

      for (const code of [400, 401, 403, 404]) {
        mockWithScope.mockClear();
        mockCaptureMessage.mockClear();

        const request = buildFakeRequest();
        const reply = buildFakeReply(code);

        await hook(request, reply);
        expect(mockCaptureMessage).not.toHaveBeenCalled();
      }
    });

    it("does NOT capture 2xx responses", async () => {
      const fakeFastify = await setupPlugin("https://key@sentry.io/123");
      const onResponseHooks = fakeFastify.getHook("onResponse");
      const hook = onResponseHooks[0];

      const request = buildFakeRequest();
      const reply = buildFakeReply(200);

      await hook(request, reply);

      expect(mockCaptureMessage).not.toHaveBeenCalled();
    });
  });
});
