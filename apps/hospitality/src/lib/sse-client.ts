/**
 * SseClient — pure transport layer for Server-Sent Events.
 *
 * Owns: connection lifecycle, exponential backoff, rate-limit cooldown,
 * Last-Event-ID resumption, typed event parsing with error surfacing.
 *
 * React-free. Accepts an injectable EventSource factory so tests can
 * exercise all behaviour without a live server.
 */

/* ── Backoff constants ──────────────────────────────────────────── */

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const MAX_BACKOFF_ATTEMPTS = 8;

/* ── Types ──────────────────────────────────────────────────────── */

export type EventSourceFactory = (url: string) => EventSource;

export interface SseClientOptions {
  /** Base URL for the SSE stream (query params appended by SseClient). */
  url: string;
  /** Named event types to listen for (e.g. "reservation:created"). */
  eventTypes: readonly string[];
  /** Called with a parsed event payload on each successfully parsed message. */
  onEvent: (type: string, payload: unknown) => void;
  /** Called when a parse error occurs or the connection errors. */
  onError: (error: Error) => void;
  /** Called when the EventSource opens successfully. */
  onConnected?: () => void;
  /** Called when the EventSource closes due to an error. */
  onDisconnected?: () => void;
  /** Injectable factory — defaults to `(url) => new EventSource(url)`. */
  eventSourceFactory?: EventSourceFactory;
}

/* ── SseClient ──────────────────────────────────────────────────── */

export class SseClient {
  private readonly options: Required<SseClientOptions>;
  private eventSource: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private lastEventId: string | null = null;

  constructor(options: SseClientOptions) {
    this.options = {
      onConnected: () => undefined,
      onDisconnected: () => undefined,
      eventSourceFactory: (url: string) => new EventSource(url),
      ...options,
    };
  }

  /** Open the SSE connection. No-op if already connected. */
  connect(): void {
    if (this.eventSource !== null) return;
    this.openConnection();
  }

  /** Close the connection and cancel any pending reconnect. */
  disconnect(): void {
    this.clearReconnectTimer();
    this.closeEventSource();
  }

  private openConnection(): void {
    const url = this.buildUrl();
    const es = this.options.eventSourceFactory(url);
    this.eventSource = es;

    es.onopen = () => {
      this.reconnectAttempts = 0;
      this.options.onConnected();
    };

    es.onerror = () => {
      es.close();
      this.eventSource = null;
      this.options.onError(new Error("SSE connection error"));
      this.options.onDisconnected();
      this.scheduleReconnect();
    };

    for (const type of this.options.eventTypes) {
      es.addEventListener(type, (event: MessageEvent) => {
        // Track Last-Event-ID for resumption
        if (event.lastEventId) {
          this.lastEventId = event.lastEventId;
        }
        this.handleRawEvent(type, event.data as string);
      });
    }
  }

  private handleRawEvent(type: string, rawData: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(rawData);
    } catch (err) {
      this.options.onError(
        err instanceof Error
          ? err
          : new Error(`Failed to parse SSE event "${type}": ${String(err)}`)
      );
      return;
    }
    this.options.onEvent(type, payload);
  }

  private scheduleReconnect(): void {
    const attempts = this.reconnectAttempts;
    const delay =
      attempts >= MAX_BACKOFF_ATTEMPTS
        ? RATE_LIMIT_COOLDOWN_MS
        : Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempts), MAX_BACKOFF_MS);
    this.reconnectAttempts = attempts + 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openConnection();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeEventSource(): void {
    if (this.eventSource !== null) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private buildUrl(): string {
    const url = new URL(this.options.url);
    if (this.lastEventId !== null) {
      url.searchParams.set("lastEventId", this.lastEventId);
    }
    return url.toString();
  }
}
