import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockSentryInit,
  mockSetTag,
  mockWithScope,
  mockCaptureException,
  mockCaptureMessage,
  mockAddBreadcrumb,
} = vi.hoisted(() => ({
  mockSentryInit: vi.fn(),
  mockSetTag: vi.fn(),
  mockWithScope: vi.fn(),
  mockCaptureException: vi.fn().mockReturnValue("event-id"),
  mockCaptureMessage: vi.fn().mockReturnValue("msg-id"),
  mockAddBreadcrumb: vi.fn(),
}));

vi.mock("@sentry/react", () => ({
  init: mockSentryInit,
  setTag: mockSetTag,
  withScope: mockWithScope,
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
  addBreadcrumb: mockAddBreadcrumb,
}));

import { initSentry, handleErrorBoundary, reportApiError } from "./react.js";

describe("initSentry (react)", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv.NODE_ENV = process.env.NODE_ENV;
    savedEnv.SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT;
    savedEnv.SENTRY_RELEASE = process.env.SENTRY_RELEASE;
    delete process.env.NODE_ENV;
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.SENTRY_RELEASE;
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("does NOT call Sentry.init when DSN is empty string", () => {
    initSentry({ appName: "my-app", dsn: "" });
    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it("calls Sentry.init when DSN is provided", () => {
    initSentry({ appName: "my-app", dsn: "https://key@sentry.io/456" });
    expect(mockSentryInit).toHaveBeenCalledTimes(1);
  });

  it("passes dsn to Sentry.init", () => {
    initSentry({ appName: "my-app", dsn: "https://key@sentry.io/456" });
    expect(mockSentryInit.mock.calls[0][0].dsn).toBe("https://key@sentry.io/456");
  });

  it("passes environment from NODE_ENV to Sentry.init", () => {
    process.env.NODE_ENV = "production";
    initSentry({ appName: "my-app", dsn: "https://key@sentry.io/456" });
    expect(mockSentryInit.mock.calls[0][0].environment).toBe("production");
  });

  it("defaults environment to 'development' when NODE_ENV not set", () => {
    initSentry({ appName: "my-app", dsn: "https://key@sentry.io/456" });
    expect(mockSentryInit.mock.calls[0][0].environment).toBe("development");
  });

  it("sets replaysSessionSampleRate to 0", () => {
    initSentry({ appName: "my-app", dsn: "https://key@sentry.io/456" });
    expect(mockSentryInit.mock.calls[0][0].replaysSessionSampleRate).toBe(0);
  });

  it("sets replaysOnErrorSampleRate to 0", () => {
    initSentry({ appName: "my-app", dsn: "https://key@sentry.io/456" });
    expect(mockSentryInit.mock.calls[0][0].replaysOnErrorSampleRate).toBe(0);
  });

  it("passes empty integrations array", () => {
    initSentry({ appName: "my-app", dsn: "https://key@sentry.io/456" });
    expect(mockSentryInit.mock.calls[0][0].integrations).toEqual([]);
  });

  it("calls Sentry.setTag with app name after init", () => {
    initSentry({ appName: "hospitality", dsn: "https://key@sentry.io/456" });
    expect(mockSetTag).toHaveBeenCalledWith("app", "hospitality");
  });

  it("does NOT call setTag when DSN is empty (init skipped)", () => {
    initSentry({ appName: "hospitality", dsn: "" });
    expect(mockSetTag).not.toHaveBeenCalled();
  });

  it("uses SENTRY_ENVIRONMENT when set", () => {
    process.env.SENTRY_ENVIRONMENT = "staging";
    initSentry({ appName: "my-app", dsn: "https://key@sentry.io/456" });
    expect(mockSentryInit.mock.calls[0][0].environment).toBe("staging");
  });

  it("uses SENTRY_RELEASE when set", () => {
    process.env.SENTRY_RELEASE = "v2.0.0";
    initSentry({ appName: "my-app", dsn: "https://key@sentry.io/456" });
    expect(mockSentryInit.mock.calls[0][0].release).toBe("v2.0.0");
  });
});

describe("handleErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Sentry.withScope", () => {
    const error = new Error("React render failed");
    const errorInfo = { componentStack: "\n    at MyComponent" };

    handleErrorBoundary(error, errorInfo);

    expect(mockWithScope).toHaveBeenCalledTimes(1);
  });

  it("sets componentStack as extra and captures exception", () => {
    const error = new Error("Crash");
    const errorInfo = { componentStack: "\n    at App\n    at ErrorBoundary" };

    const fakeScope = {
      setExtra: vi.fn(),
    };
    mockWithScope.mockImplementation((fn: (scope: typeof fakeScope) => void) => fn(fakeScope));

    handleErrorBoundary(error, errorInfo);

    expect(fakeScope.setExtra).toHaveBeenCalledWith(
      "componentStack",
      "\n    at App\n    at ErrorBoundary"
    );
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it("captures the original error object", () => {
    const error = new TypeError("Cannot read property 'foo' of undefined");
    const errorInfo = { componentStack: "\n    at Widget" };

    const fakeScope = { setExtra: vi.fn() };
    mockWithScope.mockImplementation((fn: (scope: typeof fakeScope) => void) => fn(fakeScope));

    handleErrorBoundary(error, errorInfo);

    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it("works with null componentStack", () => {
    const error = new Error("Crash");
    const errorInfo = { componentStack: null as unknown as string };

    const fakeScope = { setExtra: vi.fn() };
    mockWithScope.mockImplementation((fn: (scope: typeof fakeScope) => void) => fn(fakeScope));

    expect(() => handleErrorBoundary(error, errorInfo)).not.toThrow();
  });
});

describe("reportApiError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeError(overrides: {
    statusCode: number;
    method?: string;
    path?: string;
    message?: string;
  }) {
    return {
      statusCode: overrides.statusCode,
      method: overrides.method ?? "GET",
      path: overrides.path ?? "/api/v1/test",
      message: overrides.message ?? "Error",
      name: "ApiClientError",
      response: {
        status: overrides.statusCode,
        message: overrides.message ?? "Error",
      },
    };
  }

  it("calls captureException for 5xx server errors", () => {
    const error = makeError({
      statusCode: 500,
      method: "POST",
      path: "/api/v1/reservations",
      message: "Internal Server Error",
    });

    reportApiError(error as never);

    expect(mockCaptureException).toHaveBeenCalledWith(error);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("calls captureException for 502 server errors", () => {
    const error = makeError({ statusCode: 502, message: "Bad Gateway" });

    reportApiError(error as never);

    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it("calls captureMessage with warning for 401 errors", () => {
    const error = makeError({
      statusCode: 401,
      method: "GET",
      path: "/api/v1/users/me",
      message: "Unauthorized",
    });

    reportApiError(error as never);

    expect(mockCaptureMessage).toHaveBeenCalledWith("Unauthorized", "warning");
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("calls captureMessage with warning for 403 errors", () => {
    const error = makeError({
      statusCode: 403,
      method: "DELETE",
      path: "/api/v1/venues/v1",
      message: "Forbidden",
    });

    reportApiError(error as never);

    expect(mockCaptureMessage).toHaveBeenCalledWith("Forbidden", "warning");
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("does not call captureException or captureMessage for other 4xx errors", () => {
    const error = makeError({
      statusCode: 404,
      method: "GET",
      path: "/api/v1/venues/missing",
      message: "Not Found",
    });

    reportApiError(error as never);

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("always adds a breadcrumb with category api", () => {
    const error = makeError({
      statusCode: 404,
      method: "GET",
      path: "/api/v1/venues/missing",
    });

    reportApiError(error as never);

    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "api",
        message: "GET /api/v1/venues/missing → 404",
        data: expect.objectContaining({
          statusCode: 404,
          method: "GET",
          path: "/api/v1/venues/missing",
        }),
      })
    );
  });

  it("uses error level in breadcrumb for 5xx", () => {
    const error = makeError({ statusCode: 503 });

    reportApiError(error as never);

    expect(mockAddBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));
  });

  it("uses warning level in breadcrumb for 4xx", () => {
    const error = makeError({ statusCode: 422 });

    reportApiError(error as never);

    expect(mockAddBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ level: "warning" }));
  });

  it("uses warning level in breadcrumb for 401", () => {
    const error = makeError({ statusCode: 401 });

    reportApiError(error as never);

    expect(mockAddBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ level: "warning" }));
  });
});
