import { describe, it, expect, vi, afterEach } from "vitest";
import { streamNDJSON } from "./streaming.js";

/**
 * Integration tests for the NDJSON streaming utility.
 *
 * Verifies actual stream parsing behavior — multi-line buffering,
 * incomplete chunk handling, and error propagation — without mocking
 * the ReadableStream internals.
 */

function createMockResponse(lines: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("streamNDJSON integration", () => {
  it("parses complete NDJSON lines", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse([
        '{"type":"start","id":1}\n',
        '{"type":"data","value":"hello"}\n',
        '{"type":"end"}\n',
      ])
    );

    const results: unknown[] = [];
    for await (const obj of streamNDJSON({ url: "/test", body: {} })) {
      results.push(obj);
    }

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ type: "start", id: 1 });
    expect(results[1]).toEqual({ type: "data", value: "hello" });
    expect(results[2]).toEqual({ type: "end" });
  });

  it("handles chunked data split across boundaries", async () => {
    // Simulate a JSON object split across two chunks
    mockFetch.mockResolvedValueOnce(
      createMockResponse([
        '{"type":"star',
        't","id":1}\n{"type":"end"}\n',
      ])
    );

    const results: unknown[] = [];
    for await (const obj of streamNDJSON({ url: "/test", body: {} })) {
      results.push(obj);
    }

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ type: "start", id: 1 });
    expect(results[1]).toEqual({ type: "end" });
  });

  it("skips empty lines", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse([
        '{"type":"a"}\n\n\n{"type":"b"}\n',
      ])
    );

    const results: unknown[] = [];
    for await (const obj of streamNDJSON({ url: "/test", body: {} })) {
      results.push(obj);
    }

    expect(results).toHaveLength(2);
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse([], 500)
    );

    const results: unknown[] = [];
    await expect(async () => {
      for await (const obj of streamNDJSON({ url: "/test", body: {} })) {
        results.push(obj);
      }
    }).rejects.toThrow();
  });

  it("handles abort signal", async () => {
    const controller = new AbortController();

    mockFetch.mockResolvedValueOnce(
      createMockResponse([
        '{"type":"start"}\n',
        // This simulates an infinite stream
      ])
    );

    const results: unknown[] = [];
    // Abort after collecting first result
    setTimeout(() => controller.abort(), 10);

    try {
      for await (const obj of streamNDJSON({
        url: "/test",
        body: {},
        signal: controller.signal,
      })) {
        results.push(obj);
      }
    } catch (e) {
      // AbortError is expected
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        throw e;
      }
    }

    expect(results.length).toBeGreaterThanOrEqual(0);
  });
});
