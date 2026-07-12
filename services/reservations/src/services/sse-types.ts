/**
 * Shared SSE types.
 *
 * Owns the types shared between the SSE connection manager and the
 * per-connection wrapper, so neither module needs to import the other
 * for type-only access (breaks the import cycle).
 */

/** Configuration for SSE resource limits. */
export interface SseConnectionConfig {
  /** Maximum concurrent SSE connections per IP address. */
  readonly maxConnectionsPerIp: number;
  /** Maximum connection lifetime in milliseconds. */
  readonly connectionTimeoutMs: number;
  /** Maximum queued events per connection before dropping oldest. */
  readonly maxEventBufferSize: number;
  /** Heartbeat interval in milliseconds. */
  readonly heartbeatIntervalMs: number;
}
