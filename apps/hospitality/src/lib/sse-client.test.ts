import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SseClient } from "./sse-client.js";
import type { SseClientOptions, FetchEventSourceFn } from "./sse-client.js";

/* ── Fake fetchEventSource implementation ─────────────────────────
 *
 * SseClient calls fetchEventSourceImpl once per connection attempt and owns
 * all reconnect/backoff scheduling itself — the fake never auto-retries.
 * Each call is recorded so tests can drive onopen/onmessage/onerror directly.
 */

interface FakeCall {
  url: string;
  headers: Record<string, string>;
  aborted: boolean;
  onopen: (response: Response) => Promise<void>;
  onmessage: (ev: { event: string; data: string; id: string }) => void;
  onerror: (err: unknown) => unknown;
}

function makeFetchImpl(): { impl: FetchEventSourceFn; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const impl = ((url: string, init: Record<string, unknown>) => {
    const call: FakeCall = {
      url,
      headers: (init.headers as Record<string, string>) ?? {},
      aborted: false,
      onopen: init.onopen as FakeCall["onopen"],
      onmessage: init.onmessage as FakeCall["onmessage"],
      onerror: init.onerror as FakeCall["onerror"],
    };
    calls.push(call);
    const signal = init.signal as AbortSignal | undefined;
    signal?.addEventListener("abort", () => {
      call.aborted = true;
    });
    return new Promise<void>(() => {
      /* never resolves in tests — lifecycle is driven via onopen/onerror */
    });
  }) as unknown as FetchEventSourceFn;
  return { impl, calls };
}

function latest(calls: FakeCall[]): FakeCall {
  return calls[calls.length - 1];
}

function okResponse(): Response {
  return new Response(null, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function simulateOpen(calls: FakeCall[]): Promise<void> {
  await latest(calls).onopen(okResponse());
}

function simulateError(calls: FakeCall[]): void {
  try {
    latest(calls).onerror(new Error("SSE connection error"));
  } catch {
    // SseClient's onerror handler intentionally throws to stop fetchEventSource's
    // own internal auto-retry loop — SseClient owns backoff scheduling instead.
  }
}

/* ── Setup ─────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ── Tests: connection lifecycle ───────────────────────────────── */

describe("SseClient — connection lifecycle", () => {
  it("calls fetchEventSourceImpl with the given URL on connect()", () => {
    const { impl, calls } = makeFetchImpl();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      fetchEventSourceImpl: impl,
    });

    client.connect();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://localhost/stream");
  });

  it("aborts the in-flight request on disconnect()", () => {
    const { impl, calls } = makeFetchImpl();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      fetchEventSourceImpl: impl,
    });

    client.connect();
    client.disconnect();

    expect(latest(calls).aborted).toBe(true);
  });

  it("does not open a duplicate connection on repeated connect() calls", () => {
    const { impl, calls } = makeFetchImpl();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      fetchEventSourceImpl: impl,
    });

    client.connect();
    client.connect();

    expect(calls).toHaveLength(1);
  });
});

/* ── Tests: Authorization header ──────────────────────────────── */

describe("SseClient — Authorization header", () => {
  it("attaches an Authorization header when getAccessToken returns a token", () => {
    const { impl, calls } = makeFetchImpl();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      getAccessToken: () => "abc123",
      fetchEventSourceImpl: impl,
    });

    client.connect();

    expect(latest(calls).headers.Authorization).toBe("Bearer abc123");
  });

  it("omits the Authorization header when getAccessToken returns null", () => {
    const { impl, calls } = makeFetchImpl();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      getAccessToken: () => null,
      fetchEventSourceImpl: impl,
    });

    client.connect();

    expect(latest(calls).headers.Authorization).toBeUndefined();
  });

  it("re-reads getAccessToken on each reconnect attempt", () => {
    let token = "token-1";
    const { impl, calls } = makeFetchImpl();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      getAccessToken: () => token,
      fetchEventSourceImpl: impl,
    });

    client.connect();
    token = "token-2";
    simulateError(calls);
    vi.advanceTimersByTime(1000);

    expect(latest(calls).headers.Authorization).toBe("Bearer token-2");
  });
});

/* ── Tests: backoff progression ───────────────────────────────── */

describe("SseClient — backoff progression", () => {
  function makeClient(
    calls: FakeCall[],
    impl: FetchEventSourceFn,
    opts?: Partial<SseClientOptions>
  ): SseClient {
    return new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      fetchEventSourceImpl: impl,
      ...opts,
    });
  }

  it("reconnects after first error at INITIAL_BACKOFF_MS (1000ms)", () => {
    const { impl, calls } = makeFetchImpl();
    const client = makeClient(calls, impl);
    client.connect();

    simulateError(calls);
    expect(calls).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(2);
  });

  it("doubles backoff on consecutive errors (exponential)", () => {
    const { impl, calls } = makeFetchImpl();
    const client = makeClient(calls, impl);
    client.connect();

    simulateError(calls);
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(2);

    simulateError(calls);
    vi.advanceTimersByTime(1999);
    expect(calls).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(calls).toHaveLength(3);
  });

  it("caps backoff at MAX_BACKOFF_MS (30000ms)", () => {
    const { impl, calls } = makeFetchImpl();
    const client = makeClient(calls, impl);
    client.connect();

    for (let i = 0; i < 10; i++) {
      simulateError(calls);
      vi.advanceTimersByTime(30_001);
    }

    const countBefore = calls.length;
    simulateError(calls);

    vi.advanceTimersByTime(30_000);
    expect(calls.length).toBeGreaterThan(countBefore);
  });

  it("resets backoff after successful connection", async () => {
    const { impl, calls } = makeFetchImpl();
    const client = makeClient(calls, impl);
    client.connect();

    simulateError(calls);
    vi.advanceTimersByTime(1000);

    await simulateOpen(calls);

    simulateError(calls);
    const countBefore = calls.length;

    vi.advanceTimersByTime(999);
    expect(calls.length).toBe(countBefore);

    vi.advanceTimersByTime(1);
    expect(calls.length).toBe(countBefore + 1);
  });
});

/* ── Tests: rate-limit cooldown ───────────────────────────────── */

describe("SseClient — rate-limit cooldown", () => {
  it("uses RATE_LIMIT_COOLDOWN_MS after MAX_BACKOFF_ATTEMPTS consecutive failures", () => {
    const { impl, calls } = makeFetchImpl();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      fetchEventSourceImpl: impl,
    });
    client.connect();

    for (let i = 0; i < 8; i++) {
      simulateError(calls);
      vi.advanceTimersByTime(30_001);
    }

    const countBefore = calls.length;
    simulateError(calls);

    vi.advanceTimersByTime(30_000);
    expect(calls.length).toBe(countBefore);

    vi.advanceTimersByTime(30_001);
    expect(calls.length).toBe(countBefore + 1);
  });
});

/* ── Tests: Last-Event-ID resumption ──────────────────────────── */

describe("SseClient — Last-Event-ID resumption", () => {
  it("includes lastEventId in URL on reconnect when server sent one", () => {
    const { impl, calls } = makeFetchImpl();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: ["reservation:created"],
      onEvent: vi.fn(),
      onError: vi.fn(),
      fetchEventSourceImpl: impl,
    });
    client.connect();

    latest(calls).onmessage({
      event: "reservation:created",
      data: JSON.stringify({
        type: "reservation:created",
        venueId: "v1",
        timestamp: "2026-01-01T00:00:00Z",
        data: {},
      }),
      id: "evt-42",
    });

    simulateError(calls);
    vi.advanceTimersByTime(1000);

    expect(latest(calls).url).toContain("lastEventId=evt-42");
  });

  it("does not include lastEventId if no events were received", () => {
    const { impl, calls } = makeFetchImpl();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      fetchEventSourceImpl: impl,
    });
    client.connect();

    simulateError(calls);
    vi.advanceTimersByTime(1000);

    expect(latest(calls).url).not.toContain("lastEventId");
  });
});

/* ── Tests: parse-error surfaced ──────────────────────────────── */

describe("SseClient — parse errors surfaced via onError", () => {
  it("calls onError when event data is invalid JSON", () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const { impl, calls } = makeFetchImpl();

    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: ["reservation:created"],
      onEvent,
      onError,
      fetchEventSourceImpl: impl,
    });
    client.connect();

    latest(calls).onmessage({ event: "reservation:created", data: "not-json{{", id: "" });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("does NOT call onEvent when event data is invalid JSON", () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const { impl, calls } = makeFetchImpl();

    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: ["reservation:created"],
      onEvent,
      onError,
      fetchEventSourceImpl: impl,
    });
    client.connect();

    latest(calls).onmessage({ event: "reservation:created", data: "not-json{{", id: "" });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("calls onEvent normally when event data is valid JSON", () => {
    const onEvent = vi.fn();
    const onError = vi.fn();
    const { impl, calls } = makeFetchImpl();

    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: ["reservation:created"],
      onEvent,
      onError,
      fetchEventSourceImpl: impl,
    });
    client.connect();

    latest(calls).onmessage({
      event: "reservation:created",
      data: JSON.stringify({
        type: "reservation:created",
        venueId: "v1",
        timestamp: "2026-01-01T00:00:00Z",
        data: { id: "r1" },
      }),
      id: "",
    });

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores messages whose event type is not in eventTypes", () => {
    const onEvent = vi.fn();
    const { impl, calls } = makeFetchImpl();

    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: ["reservation:created"],
      onEvent,
      onError: vi.fn(),
      fetchEventSourceImpl: impl,
    });
    client.connect();

    latest(calls).onmessage({
      event: "connected",
      data: JSON.stringify({ message: "hi" }),
      id: "",
    });

    expect(onEvent).not.toHaveBeenCalled();
  });
});

/* ── Tests: onConnected/onDisconnected callbacks ──────────────── */

describe("SseClient — connection callbacks", () => {
  it("calls onConnected when the stream opens successfully", async () => {
    const onConnected = vi.fn();
    const { impl, calls } = makeFetchImpl();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      onConnected,
      fetchEventSourceImpl: impl,
    });

    client.connect();
    await simulateOpen(calls);

    expect(onConnected).toHaveBeenCalledOnce();
  });

  it("calls onDisconnected when the connection errors", () => {
    const onDisconnected = vi.fn();
    const { impl, calls } = makeFetchImpl();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      onDisconnected,
      fetchEventSourceImpl: impl,
    });

    client.connect();
    simulateError(calls);

    expect(onDisconnected).toHaveBeenCalledOnce();
  });
});
