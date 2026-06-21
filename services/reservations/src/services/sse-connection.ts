import type { FastifyRequest } from "fastify";
import type { OutgoingHttpHeaders } from "node:http";
import type { SseConnectionConfig } from "./sse-connection-manager.js";
import type { ReservationEvent } from "./events.js";

/** Minimal interface for the raw HTTP response needed by SseConnection. */
export interface ReplyRaw {
  readonly writableEnded: boolean;
  writeHead(statusCode: number, headers: OutgoingHttpHeaders): void;
  write(chunk: string): boolean;
  end(): void;
}

/** Per-connection event buffer that drops oldest events when full. */
class EventBuffer {
  private readonly maxSize: number;
  private buffer: readonly ReservationEvent[] = [];
  private _droppedCount = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /** Push an event, dropping the oldest if the buffer is full. Returns true if an event was dropped. */
  push(event: ReservationEvent): boolean {
    if (this.buffer.length >= this.maxSize) {
      this.buffer = [...this.buffer.slice(1), event];
      this._droppedCount += 1;
      return true;
    }
    this.buffer = [...this.buffer, event];
    return false;
  }

  /** Drain all buffered events, resetting the buffer. */
  drain(): readonly ReservationEvent[] {
    const events = this.buffer;
    this.buffer = [];
    return events;
  }

  get droppedCount(): number {
    return this._droppedCount;
  }
}

/** Minimal request interface needed by SseConnection. */
export interface RequestLike {
  readonly ip: string;
  readonly log: Pick<FastifyRequest["log"], "info" | "warn">;
  readonly raw: Pick<FastifyRequest["raw"], "on">;
}

/**
 * Owns the full lifecycle of a single SSE connection:
 * event buffering, heartbeat scheduling, connection timeout, and teardown.
 */
export class SseConnection {
  readonly id: string;

  private readonly raw: ReplyRaw;
  private readonly buffer: EventBuffer;
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;
  private readonly timeoutTimer: ReturnType<typeof setTimeout>;
  private readonly connectionId: string;
  private readonly clientIp: string;
  private readonly log: RequestLike["log"];

  constructor(
    id: string,
    request: RequestLike,
    reply: { readonly raw: ReplyRaw },
    config: SseConnectionConfig,
    onClose?: () => void
  ) {
    this.id = id;
    this.connectionId = id;
    this.clientIp = request.ip;
    this.log = request.log;
    this.raw = reply.raw;
    this.buffer = new EventBuffer(config.maxEventBufferSize);

    // Write SSE headers
    this.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial connection event
    this.raw.write(
      `event: connected\ndata: ${JSON.stringify({ message: "Connected to event stream" })}\n\n`
    );

    // Heartbeat: keep-alive ping
    this.heartbeatTimer = setInterval(() => {
      if (!this.raw.writableEnded) {
        this.raw.write(`: ping\n\n`);
      }
    }, config.heartbeatIntervalMs);

    // Connection timeout: close idle connections after max lifetime
    this.timeoutTimer = setTimeout(() => {
      if (!this.raw.writableEnded) {
        request.log.info(
          {
            connectionId: this.connectionId,
            ip: this.clientIp,
            lifetimeMs: config.connectionTimeoutMs,
          },
          "SSE connection closed: max lifetime reached"
        );
        this.raw.write(
          `event: timeout\ndata: ${JSON.stringify({ message: "Connection timeout — please reconnect" })}\n\n`
        );
        this.raw.end();
      }
    }, config.connectionTimeoutMs);

    // Cleanup on client disconnect
    request.raw.on("close", () => {
      this.teardown();
      onClose?.();
    });
  }

  /**
   * Write a domain event to the SSE stream.
   * Buffers the event and drains all buffered events in order.
   * No-op if the stream has already ended.
   */
  write(event: ReservationEvent): void {
    if (this.raw.writableEnded) return;

    const dropped = this.buffer.push(event);
    if (dropped && this.buffer.droppedCount % 10 === 0) {
      // Log every 10th drop to avoid log flooding while keeping overflow visible.
      this.log.warn(
        {
          connectionId: this.connectionId,
          ip: this.clientIp,
          droppedTotal: this.buffer.droppedCount,
        },
        "SSE event buffer overflow — dropping oldest events"
      );
    }

    for (const bufferedEvent of this.buffer.drain()) {
      this.raw.write(`event: ${bufferedEvent.type}\ndata: ${JSON.stringify(bufferedEvent)}\n\n`);
    }
  }

  /**
   * Clear heartbeat and timeout timers.
   * Safe to call multiple times (idempotent).
   */
  teardown(): void {
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.timeoutTimer);
  }
}
