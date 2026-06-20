import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SseClient } from "./sse-client.js";
import type { SseClientOptions } from "./sse-client.js";

/* ── Mock EventSource factory ──────────────────────────────────── */

type EventSourceListener = (event: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  private listeners = new Map<string, EventSourceListener[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventSourceListener): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  removeEventListener(type: string, listener: EventSourceListener): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      existing.filter((l) => l !== listener)
    );
  }

  close(): void {
    this.readyState = 2;
  }

  simulateOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateError(): void {
    this.onerror?.();
  }

  simulateEvent(type: string, data: unknown, lastEventId?: string): void {
    const listeners = this.listeners.get(type) ?? [];
    const event = new MessageEvent(type, {
      data: JSON.stringify(data),
      lastEventId: lastEventId ?? "",
    });
    for (const listener of listeners) {
      listener(event);
    }
  }
}

function latestEs(): MockEventSource {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

function makeFactory(): (url: string) => MockEventSource {
  return (url: string) => new MockEventSource(url);
}

/* ── Setup ─────────────────────────────────────────────────────── */

beforeEach(() => {
  MockEventSource.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ── Tests: connection lifecycle ───────────────────────────────── */

describe("SseClient — connection lifecycle", () => {
  it("creates an EventSource at the given URL on connect()", () => {
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      eventSourceFactory: makeFactory(),
    });

    client.connect();

    expect(MockEventSource.instances).toHaveLength(1);
    expect(latestEs().url).toBe("http://localhost/stream");
  });

  it("closes the EventSource on disconnect()", () => {
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      eventSourceFactory: makeFactory(),
    });

    client.connect();
    const es = latestEs();
    client.disconnect();

    expect(es.readyState).toBe(2);
  });

  it("does not create duplicate EventSources on repeated connect() calls", () => {
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      eventSourceFactory: makeFactory(),
    });

    client.connect();
    client.connect();

    expect(MockEventSource.instances).toHaveLength(1);
  });
});

/* ── Tests: backoff progression ───────────────────────────────── */

describe("SseClient — backoff progression", () => {
  function makeClient(opts?: Partial<SseClientOptions>): SseClient {
    return new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      eventSourceFactory: makeFactory(),
      ...opts,
    });
  }

  it("reconnects after first error at INITIAL_BACKOFF_MS (1000ms)", () => {
    const client = makeClient();
    client.connect();

    vi.runAllTicks();
    latestEs().simulateError();
    expect(MockEventSource.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it("doubles backoff on consecutive errors (exponential)", () => {
    const client = makeClient();
    client.connect();

    // First error → reconnects at 1000ms
    latestEs().simulateError();
    vi.advanceTimersByTime(1000);
    expect(MockEventSource.instances).toHaveLength(2);

    // Second error → reconnects at 2000ms
    latestEs().simulateError();
    vi.advanceTimersByTime(1999);
    expect(MockEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(3);
  });

  it("caps backoff at MAX_BACKOFF_MS (30000ms)", () => {
    const client = makeClient();
    client.connect();

    // Drive many errors through the backoff ceiling
    for (let i = 0; i < 10; i++) {
      latestEs().simulateError();
      vi.advanceTimersByTime(30_001);
    }

    const countBefore = MockEventSource.instances.length;
    latestEs().simulateError();

    // Should reconnect within 30s (not longer, indicating it's capped)
    vi.advanceTimersByTime(30_000);
    expect(MockEventSource.instances.length).toBeGreaterThan(countBefore);
  });

  it("resets backoff after successful connection", () => {
    const client = makeClient();
    client.connect();

    // Cause an error + reconnect cycle
    latestEs().simulateError();
    vi.advanceTimersByTime(1000);

    // Simulate successful open (resets attempts)
    latestEs().simulateOpen();

    // Next error should be back to 1000ms
    latestEs().simulateError();
    const countBefore = MockEventSource.instances.length;

    vi.advanceTimersByTime(999);
    expect(MockEventSource.instances.length).toBe(countBefore);

    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances.length).toBe(countBefore + 1);
  });
});

/* ── Tests: rate-limit cooldown ───────────────────────────────── */

describe("SseClient — rate-limit cooldown", () => {
  it("uses RATE_LIMIT_COOLDOWN_MS after MAX_BACKOFF_ATTEMPTS consecutive failures", () => {
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      eventSourceFactory: makeFactory(),
    });
    client.connect();

    // MAX_BACKOFF_ATTEMPTS = 8; exhaust all attempts
    for (let i = 0; i < 8; i++) {
      latestEs().simulateError();
      vi.advanceTimersByTime(30_001);
    }

    const countBefore = MockEventSource.instances.length;
    latestEs().simulateError();

    // 30s is NOT enough (60s cooldown is active)
    vi.advanceTimersByTime(30_000);
    expect(MockEventSource.instances.length).toBe(countBefore);

    // After 60s total, it reconnects
    vi.advanceTimersByTime(30_001);
    expect(MockEventSource.instances.length).toBe(countBefore + 1);
  });
});

/* ── Tests: Last-Event-ID resumption ──────────────────────────── */

describe("SseClient — Last-Event-ID resumption", () => {
  it("includes lastEventId in URL on reconnect when server sent one", () => {
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: ["reservation:created"],
      onEvent: vi.fn(),
      onError: vi.fn(),
      eventSourceFactory: makeFactory(),
    });
    client.connect();

    // Server sends an event with a lastEventId
    latestEs().simulateEvent(
      "reservation:created",
      { type: "reservation:created", venueId: "v1", timestamp: "2026-01-01T00:00:00Z", data: {} },
      "evt-42"
    );

    // Simulate error → triggers reconnect
    latestEs().simulateError();
    vi.advanceTimersByTime(1000);

    // Reconnected URL should contain the lastEventId
    expect(latestEs().url).toContain("lastEventId=evt-42");
  });

  it("does not include lastEventId if no events were received", () => {
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      eventSourceFactory: makeFactory(),
    });
    client.connect();

    latestEs().simulateError();
    vi.advanceTimersByTime(1000);

    expect(latestEs().url).not.toContain("lastEventId");
  });
});

/* ── Tests: parse-error surfaced ──────────────────────────────── */

describe("SseClient — parse errors surfaced via onError", () => {
  it("calls onError when event data is invalid JSON", () => {
    const onError = vi.fn();
    const onEvent = vi.fn();

    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: ["reservation:created"],
      onEvent,
      onError,
      eventSourceFactory: makeFactory(),
    });
    client.connect();

    // Manually dispatch a raw event with invalid JSON
    const es = latestEs();
    const badEvent = new MessageEvent("reservation:created", { data: "not-json{{" });
    // Trigger the listener directly
    const listeners = (es as unknown as { listeners: Map<string, ((e: MessageEvent) => void)[]> })
      .listeners;
    const handlers = listeners?.get?.("reservation:created") ?? [];
    for (const h of handlers) {
      h(badEvent);
    }

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("does NOT call onEvent when event data is invalid JSON", () => {
    const onError = vi.fn();
    const onEvent = vi.fn();

    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: ["reservation:created"],
      onEvent,
      onError,
      eventSourceFactory: makeFactory(),
    });
    client.connect();

    const es = latestEs();
    const badEvent = new MessageEvent("reservation:created", { data: "not-json{{" });
    const listeners = (es as unknown as { listeners: Map<string, ((e: MessageEvent) => void)[]> })
      .listeners;
    const handlers = listeners?.get?.("reservation:created") ?? [];
    for (const h of handlers) {
      h(badEvent);
    }

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("calls onEvent normally when event data is valid JSON", () => {
    const onEvent = vi.fn();
    const onError = vi.fn();

    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: ["reservation:created"],
      onEvent,
      onError,
      eventSourceFactory: makeFactory(),
    });
    client.connect();

    latestEs().simulateEvent("reservation:created", {
      type: "reservation:created",
      venueId: "v1",
      timestamp: "2026-01-01T00:00:00Z",
      data: { id: "r1" },
    });

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});

/* ── Tests: onConnected/onDisconnected callbacks ──────────────── */

describe("SseClient — connection callbacks", () => {
  it("calls onConnected when EventSource opens", () => {
    const onConnected = vi.fn();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      onConnected,
      eventSourceFactory: makeFactory(),
    });

    client.connect();
    latestEs().simulateOpen();

    expect(onConnected).toHaveBeenCalledOnce();
  });

  it("calls onDisconnected when EventSource errors", () => {
    const onDisconnected = vi.fn();
    const client = new SseClient({
      url: "http://localhost/stream",
      eventTypes: [],
      onEvent: vi.fn(),
      onError: vi.fn(),
      onDisconnected,
      eventSourceFactory: makeFactory(),
    });

    client.connect();
    latestEs().simulateError();

    expect(onDisconnected).toHaveBeenCalledOnce();
  });
});
