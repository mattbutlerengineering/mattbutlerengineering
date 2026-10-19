import { describe, it, expect, vi } from "vitest";
import { createRequestIdMiddleware } from "./request-id.js";

// We test the plugin logic by directly interacting with the plugin's hook callbacks.
// fastify-plugin just registers the plugin function, so we simulate it inline.

describe("createRequestIdMiddleware", () => {
  it("returns a plugin function (fastify-plugin wrapped)", () => {
    const plugin = createRequestIdMiddleware();
    expect(typeof plugin).toBe("function");
  });

  it("uses default header name x-request-id", async () => {
    const plugin = createRequestIdMiddleware();
    const hooks: Record<string, ((req: Record<string, unknown>) => Promise<void>)[]> = {};

    const fakeFastify = {
      addHook: vi.fn((hookName: string, fn: (req: Record<string, unknown>) => Promise<void>) => {
        hooks[hookName] = hooks[hookName] ?? [];
        hooks[hookName].push(fn);
      }),
    };

    // Invoke the inner function directly (fp wraps but calls the fn as-is in tests)
    await (plugin as unknown as (f: typeof fakeFastify) => Promise<void>)(fakeFastify);
    expect(fakeFastify.addHook).toHaveBeenCalledWith("onRequest", expect.any(Function));
  });

  it("uses incoming x-request-id header when present", async () => {
    const plugin = createRequestIdMiddleware();
    let capturedHook: ((req: Record<string, unknown>) => Promise<void>) | undefined;

    const fakeFastify = {
      addHook: vi.fn((_: string, fn: (req: Record<string, unknown>) => Promise<void>) => {
        capturedHook = fn;
      }),
    };

    await (plugin as unknown as (f: typeof fakeFastify) => Promise<void>)(fakeFastify);

    const fakeRequest: Record<string, unknown> = {
      headers: { "x-request-id": "my-custom-id" },
      id: "",
    };

    await capturedHook!(fakeRequest);
    expect(fakeRequest.id).toBe("my-custom-id");
  });

  it("generates a UUID when no x-request-id header present", async () => {
    const plugin = createRequestIdMiddleware();
    let capturedHook: ((req: Record<string, unknown>) => Promise<void>) | undefined;

    const fakeFastify = {
      addHook: vi.fn((_: string, fn: (req: Record<string, unknown>) => Promise<void>) => {
        capturedHook = fn;
      }),
    };

    await (plugin as unknown as (f: typeof fakeFastify) => Promise<void>)(fakeFastify);

    const fakeRequest: Record<string, unknown> = {
      headers: {},
      id: "",
    };

    await capturedHook!(fakeRequest);
    expect(typeof fakeRequest.id).toBe("string");
    // UUID v4 pattern
    expect(fakeRequest.id as string).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates a UUID when x-request-id header is empty string", async () => {
    const plugin = createRequestIdMiddleware();
    let capturedHook: ((req: Record<string, unknown>) => Promise<void>) | undefined;

    const fakeFastify = {
      addHook: vi.fn((_: string, fn: (req: Record<string, unknown>) => Promise<void>) => {
        capturedHook = fn;
      }),
    };

    await (plugin as unknown as (f: typeof fakeFastify) => Promise<void>)(fakeFastify);

    const fakeRequest: Record<string, unknown> = {
      headers: { "x-request-id": "" },
      id: "",
    };

    await capturedHook!(fakeRequest);
    expect(fakeRequest.id as string).toMatch(/^[0-9a-f]{8}-/i);
  });

  it("respects a custom headerName option", async () => {
    const plugin = createRequestIdMiddleware({ headerName: "x-trace-id" });
    let capturedHook: ((req: Record<string, unknown>) => Promise<void>) | undefined;

    const fakeFastify = {
      addHook: vi.fn((_: string, fn: (req: Record<string, unknown>) => Promise<void>) => {
        capturedHook = fn;
      }),
    };

    await (plugin as unknown as (f: typeof fakeFastify) => Promise<void>)(fakeFastify);

    const fakeRequest: Record<string, unknown> = {
      headers: { "x-trace-id": "trace-abc-123" },
      id: "",
    };

    await capturedHook!(fakeRequest);
    expect(fakeRequest.id).toBe("trace-abc-123");
  });

  it("uses a custom generator function when provided", async () => {
    const customGenerator = vi.fn().mockReturnValue("custom-id-xyz");
    const plugin = createRequestIdMiddleware({ generator: customGenerator });
    let capturedHook: ((req: Record<string, unknown>) => Promise<void>) | undefined;

    const fakeFastify = {
      addHook: vi.fn((_: string, fn: (req: Record<string, unknown>) => Promise<void>) => {
        capturedHook = fn;
      }),
    };

    await (plugin as unknown as (f: typeof fakeFastify) => Promise<void>)(fakeFastify);

    const fakeRequest: Record<string, unknown> = {
      headers: {},
      id: "",
    };

    await capturedHook!(fakeRequest);
    expect(customGenerator).toHaveBeenCalledTimes(1);
    expect(fakeRequest.id).toBe("custom-id-xyz");
  });

  it("ignores x-request-id when custom headerName is set", async () => {
    const plugin = createRequestIdMiddleware({ headerName: "x-trace-id" });
    let capturedHook: ((req: Record<string, unknown>) => Promise<void>) | undefined;

    const fakeFastify = {
      addHook: vi.fn((_: string, fn: (req: Record<string, unknown>) => Promise<void>) => {
        capturedHook = fn;
      }),
    };

    await (plugin as unknown as (f: typeof fakeFastify) => Promise<void>)(fakeFastify);

    const fakeRequest: Record<string, unknown> = {
      headers: { "x-request-id": "should-be-ignored", "x-trace-id": "from-trace" },
      id: "",
    };

    await capturedHook!(fakeRequest);
    expect(fakeRequest.id).toBe("from-trace");
  });
});
