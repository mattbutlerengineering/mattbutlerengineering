/**
 * SseClient — pure transport layer for Server-Sent Events.
 *
 * Owns: connection lifecycle, exponential backoff, rate-limit cooldown,
 * Last-Event-ID resumption, typed event parsing with error surfacing.
 *
 * Built on `@microsoft/fetch-event-source` rather than the native browser
 * `EventSource` because `EventSource` cannot send custom headers — the SSE
 * stream endpoint requires a Bearer Authorization header.
 * `fetchEventSourceImpl` is called once per connection attempt; SseClient
 * owns all reconnect/backoff scheduling itself (the `onerror` handler always
 * throws to stop the library's own internal auto-retry loop).
 *
 * React-free. Accepts an injectable fetchEventSource implementation so tests
 * can exercise all behaviour without a live server.
 */

import { fetchEventSource } from "@microsoft/fetch-event-source";

/* ── Backoff constants ──────────────────────────────────────────── */

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const MAX_BACKOFF_ATTEMPTS = 8;

/* ── Types ──────────────────────────────────────────────────────── */

export type FetchEventSourceFn = typeof fetchEventSource;

export interface SseClientOptions {
  /** Base URL for the SSE stream (query params appended by SseClient). */
  url: string;
  /** Named event types to listen for (e.g. "reservation:created"). */
  eventTypes: readonly string[];
  /** Called with a parsed event payload on each successfully parsed message. */
  onEvent: (type: string, payload: unknown) => void;
  /** Called when a parse error occurs or the connection errors. */
  onError: (error: Error) => void;
  /** Called when the stream opens successfully. */
  onConnected?: () => void;
  /** Called when the connection closes due to an error. */
  onDisconnected?: () => void;
  /** Returns the current bearer token for the Authorization header, or null/undefined for none. */
  getAccessToken?: () => string | null | undefined;
  /** Injectable fetchEventSource implementation — defaults to the real one. */
  fetchEventSourceImpl?: FetchEventSourceFn;
}

/**
 * Thrown from the internal `onerror` handler to stop fetchEventSource's own
 * auto-retry loop — SseClient schedules reconnects itself instead.
 */
class ConnectionClosed extends Error {}

/* ── SseClient ──────────────────────────────────────────────────── */

export class SseClient {
  private readonly options: Required<
    Pick<SseClientOptions, "onConnected" | "onDisconnected" | "fetchEventSourceImpl">
  > &
    SseClientOptions;
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private lastEventId: string | null = null;

  constructor(options: SseClientOptions) {
    this.options = {
      onConnected: () => undefined,
      onDisconnected: () => undefined,
      fetchEventSourceImpl: fetchEventSource,
      ...options,
    };
  }

  /** Open the SSE connection. No-op if already connected. */
  connect(): void {
    if (this.abortController !== null) return;
    this.openConnection();
  }

  /** Close the connection and cancel any pending reconnect. */
  disconnect(): void {
    this.clearReconnectTimer();
    this.closeConnection();
  }

  private openConnection(): void {
    const controller = new AbortController();
    this.abortController = controller;

    const headers: Record<string, string> = {};
    const token = this.options.getAccessToken?.();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    void this.options
      .fetchEventSourceImpl(this.buildUrl(), {
        headers,
        signal: controller.signal,
        openWhenHidden: true,
        onopen: async (response: Response) => {
          const contentType = response.headers.get("content-type");
          if (!response.ok || !contentType?.startsWith("text/event-stream")) {
            throw new Error(`SSE connection failed: ${response.status}`);
          }
          this.reconnectAttempts = 0;
          this.options.onConnected();
        },
        onmessage: (ev: { event: string; data: string; id: string }) => {
          if (ev.id) {
            this.lastEventId = ev.id;
          }
          if (!this.options.eventTypes.includes(ev.event)) return;
          this.handleRawEvent(ev.event, ev.data);
        },
        onerror: (err: unknown) => {
          this.abortController = null;
          this.options.onError(err instanceof Error ? err : new Error("SSE connection error"));
          this.options.onDisconnected();
          this.scheduleReconnect();
          throw new ConnectionClosed();
        },
      })
      .catch((err: unknown) => {
        if (!(err instanceof ConnectionClosed)) throw err;
      });
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

  private closeConnection(): void {
    if (this.abortController !== null) {
      this.abortController.abort();
      this.abortController = null;
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
