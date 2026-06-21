import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SseConnection } from "./sse-connection.js";
import type { RequestLike, ReplyRaw } from "./sse-connection.js";
import type { SseConnectionConfig } from "./sse-connection-manager.js";
import { DEFAULT_SSE_CONFIG } from "./sse-connection-manager.js";
import type { ReservationEvent } from "./events.js";

/** Minimal raw-response mock shaped for SseConnection. */
function makeRawMock() {
  const written: string[] = [];
  const raw = {
    writableEnded: false,
    written,
    writeHead: vi.fn(),
    write: vi.fn((chunk: string) => {
      written.push(chunk);
      return true;
    }),
    end: vi.fn(function (this: typeof raw) {
      this.writableEnded = true;
    }),
  };
  return raw;
}

type RawMock = ReturnType<typeof makeRawMock>;

function makeRequestMock() {
  return {
    ip: "10.0.0.1",
    raw: { on: vi.fn() },
    log: { info: vi.fn(), warn: vi.fn() },
  };
}

type RequestMock = ReturnType<typeof makeRequestMock>;

function makeConfig(overrides: Partial<SseConnectionConfig> = {}): SseConnectionConfig {
  return Object.freeze({ ...DEFAULT_SSE_CONFIG, ...overrides });
}

function makeReservationEvent(overrides: Partial<ReservationEvent> = {}): ReservationEvent {
  return {
    type: "reservation:created",
    venueId: "venue-1",
    timestamp: new Date().toISOString(),
    data: { id: "res-1" } as unknown as ReservationEvent["data"],
    ...overrides,
  };
}

/** Build an SseConnection using the typed mocks above. */
function makeConn(
  raw: RawMock,
  request: RequestMock,
  config: SseConnectionConfig = makeConfig(),
  id = "conn-1",
  onClose?: () => void
): SseConnection {
  return new SseConnection(
    id,
    request as unknown as RequestLike,
    { raw: raw as unknown as ReplyRaw },
    config,
    onClose
  );
}

describe("SseConnection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("construction / initial connection event", () => {
    it("writes SSE headers and initial connected event on construction", () => {
      const raw = makeRawMock();
      const conn = makeConn(raw, makeRequestMock());

      expect(raw.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ "Content-Type": "text/event-stream" })
      );
      expect(raw.written.join("")).toContain("event: connected");
      conn.teardown();
    });

    it("exposes the connection id", () => {
      const raw = makeRawMock();
      const conn = makeConn(raw, makeRequestMock(), makeConfig(), "conn-42");

      expect(conn.id).toBe("conn-42");
      conn.teardown();
    });
  });

  describe("write(event)", () => {
    it("writes an SSE event line when the stream is open", () => {
      const raw = makeRawMock();
      const conn = makeConn(raw, makeRequestMock());

      conn.write(makeReservationEvent());

      const output = raw.written.join("");
      expect(output).toContain("event: reservation:created");
      expect(output).toContain('"venueId":"venue-1"');
      conn.teardown();
    });

    it("does not write when the stream has ended", () => {
      const raw = makeRawMock();
      const conn = makeConn(raw, makeRequestMock());

      raw.writableEnded = true;
      const callsBefore = raw.write.mock.calls.length;
      conn.write(makeReservationEvent());

      expect(raw.write.mock.calls.length).toBe(callsBefore);
      conn.teardown();
    });

    it("buffers events and drops oldest when buffer is full", () => {
      const raw = makeRawMock();
      const config = makeConfig({ maxEventBufferSize: 2 });
      const conn = makeConn(raw, makeRequestMock(), config);

      // Push 3 events — 3rd should drop 1st, writing 2nd and 3rd
      conn.write(makeReservationEvent({ venueId: "v1" }));
      conn.write(makeReservationEvent({ venueId: "v2" }));
      conn.write(makeReservationEvent({ venueId: "v3" }));

      const output = raw.written.join("");
      expect(output).toContain('"venueId":"v1"');
      expect(output).toContain('"venueId":"v2"');
      expect(output).toContain('"venueId":"v3"');
      conn.teardown();
    });
  });

  describe("heartbeat", () => {
    it("sends a ping comment at the heartbeat interval", () => {
      const raw = makeRawMock();
      const conn = makeConn(raw, makeRequestMock(), makeConfig({ heartbeatIntervalMs: 1000 }));

      vi.advanceTimersByTime(1000);

      expect(raw.written.join("")).toContain(": ping");
      conn.teardown();
    });

    it("does not send ping when stream has ended", () => {
      const raw = makeRawMock();
      const conn = makeConn(raw, makeRequestMock(), makeConfig({ heartbeatIntervalMs: 1000 }));

      raw.writableEnded = true;
      const writtenBefore = raw.written.length;
      vi.advanceTimersByTime(1000);

      expect(raw.written.length).toBe(writtenBefore);
      conn.teardown();
    });
  });

  describe("connection timeout", () => {
    it("sends timeout event and ends the stream after connectionTimeoutMs", () => {
      const raw = makeRawMock();
      const conn = makeConn(raw, makeRequestMock(), makeConfig({ connectionTimeoutMs: 5000 }));

      vi.advanceTimersByTime(5000);

      const output = raw.written.join("");
      expect(output).toContain("event: timeout");
      expect(raw.end).toHaveBeenCalled();
      conn.teardown();
    });

    it("does not send timeout event if stream already ended", () => {
      const raw = makeRawMock();
      const conn = makeConn(raw, makeRequestMock(), makeConfig({ connectionTimeoutMs: 5000 }));

      raw.writableEnded = true;
      vi.advanceTimersByTime(5000);

      expect(raw.end).not.toHaveBeenCalled();
      conn.teardown();
    });
  });

  describe("teardown()", () => {
    it("clears heartbeat and timeout timers on teardown", () => {
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

      const raw = makeRawMock();
      const conn = makeConn(raw, makeRequestMock());

      conn.teardown();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("is idempotent — calling teardown twice does not throw", () => {
      const raw = makeRawMock();
      const conn = makeConn(raw, makeRequestMock());

      expect(() => {
        conn.teardown();
        conn.teardown();
      }).not.toThrow();
    });
  });

  describe("onClose callback", () => {
    it("registers a close listener on the raw request", () => {
      const request = makeRequestMock();
      const conn = makeConn(makeRawMock(), request, makeConfig(), "conn-1", vi.fn());

      expect(request.raw.on).toHaveBeenCalledWith("close", expect.any(Function));
      conn.teardown();
    });

    it("calls onClose callback when the close event fires", () => {
      const request = makeRequestMock();
      const onClose = vi.fn();

      let closeHandler: (() => void) | undefined;
      request.raw.on.mockImplementation((event: string, handler: () => void) => {
        if (event === "close") closeHandler = handler;
      });

      const conn = makeConn(makeRawMock(), request, makeConfig(), "conn-1", onClose);

      expect(closeHandler).toBeDefined();
      closeHandler!();
      expect(onClose).toHaveBeenCalled();
      conn.teardown();
    });
  });
});
