import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGenStream } from "./useGenStream.js";

/* ── Mocks ──────────────────────────────────────────────────── */

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ accessToken: "test-token-123" }),
}));

// Mock flatToTree to return a simple spec from accumulated elements
vi.mock("@json-render/react", () => ({
  flatToTree: (elements: unknown[]) => ({ type: "root", children: elements }),
}));

const mockStreamNDJSON = vi.fn();

vi.mock("@mbe/api-client/streaming", () => ({
  streamNDJSON: (...args: unknown[]) => mockStreamNDJSON(...args),
}));

beforeEach(() => {
  mockStreamNDJSON.mockReset();
});

/* ── Helpers ────────────────────────────────────────────────── */

async function* asyncGen<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

async function* asyncGenError(msg: string): AsyncGenerator<never> {
  yield* [] as never[]; // satisfy require-yield
  throw new Error(msg);
}

describe("useGenStream", () => {
  it("sends POST with prompt and auth header via streamNDJSON", async () => {
    mockStreamNDJSON.mockReturnValue(asyncGen([]));

    const { result } = renderHook(() => useGenStream({ api: "/api/gen" }));

    await act(async () => {
      await result.current.send("Hello world");
    });

    expect(mockStreamNDJSON).toHaveBeenCalledOnce();
    const callArgs = mockStreamNDJSON.mock.calls[0][0];
    expect(callArgs.url).toBe("/api/gen");
    expect(callArgs.body).toEqual({ prompt: "Hello world", context: undefined });
    expect(callArgs.headers).toEqual({
      Authorization: "Bearer test-token-123",
    });
  });

  it("parses NDJSON elements and builds spec incrementally", async () => {
    const elements = [
      { type: "heading", props: { children: "Title" }, id: "1" },
      { type: "paragraph", props: { children: "Body" }, id: "2" },
    ];
    mockStreamNDJSON.mockReturnValue(asyncGen(elements));

    const { result } = renderHook(() => useGenStream({ api: "/api/gen" }));

    await act(async () => {
      await result.current.send("Generate something");
    });

    expect(result.current.spec).not.toBeNull();
    expect(result.current.rawLines).toHaveLength(2);
    expect(result.current.isStreaming).toBe(false);
  });

  it("calls onComplete with final spec and raw lines", async () => {
    const elements = [{ type: "text", props: { children: "Hello" }, id: "1" }];
    mockStreamNDJSON.mockReturnValue(asyncGen(elements));

    const onComplete = vi.fn();
    const { result } = renderHook(() => useGenStream({ api: "/api/gen", onComplete }));

    await act(async () => {
      await result.current.send("Test prompt");
    });

    expect(onComplete).toHaveBeenCalledOnce();
    const [spec, rawLines] = onComplete.mock.calls[0];
    expect(spec).not.toBeNull();
    expect(rawLines).toHaveLength(1);
  });

  it("handles abort without setting error", async () => {
    const abortError = Object.assign(new Error("Aborted"), { name: "AbortError" });
    mockStreamNDJSON.mockImplementation(() => {
      async function* gen(): AsyncGenerator<never> {
        yield* [] as never[]; // satisfy require-yield
        throw abortError;
      }
      return gen();
    });

    const onError = vi.fn();
    const { result } = renderHook(() => useGenStream({ api: "/api/gen", onError }));

    await act(async () => {
      await result.current.send("Abort test");
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isStreaming).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onError when stream fails with non-abort error", async () => {
    mockStreamNDJSON.mockReturnValue(asyncGenError("Server error"));

    const onError = vi.fn();
    const { result } = renderHook(() => useGenStream({ api: "/api/gen", onError }));

    await act(async () => {
      await result.current.send("Fail test");
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Server error");
    expect(result.current.isStreaming).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
  });
});
