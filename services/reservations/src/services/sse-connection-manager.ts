/**
 * SSE Connection Manager
 *
 * Provides resource exhaustion protections for Server-Sent Events streams:
 * - Max connections per IP (default: 5)
 * - Connection timeout (default: 30 minutes)
 * - Event buffer limit per connection (default: 100 events)
 *
 * All state is immutable — lookups return copies, updates produce new maps.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { SseConnection } from "./sse-connection.js";

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

/** Default configuration values. */
export const DEFAULT_SSE_CONFIG: SseConnectionConfig = Object.freeze({
  maxConnectionsPerIp: 10,
  connectionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  maxEventBufferSize: 100,
  heartbeatIntervalMs: 30_000, // 30 seconds
});

/** Immutable record for a tracked SSE connection (internal registry entry). */
export interface SseConnectionRecord {
  readonly id: string;
  readonly ip: string;
  readonly connectedAt: number;
}

/** Result of attempting to register a new SSE connection. */
export type ConnectionResult =
  | { readonly allowed: true; readonly connection: SseConnectionRecord }
  | { readonly allowed: false; readonly reason: string };

/**
 * Tracks active SSE connections and enforces per-IP limits.
 *
 * Thread-safe for single-threaded Node.js — no mutation of shared maps;
 * each operation produces a new state snapshot internally.
 */
export class SseConnectionManager {
  private readonly config: SseConnectionConfig;
  private connections: ReadonlyMap<string, SseConnectionRecord> = new Map();
  private nextId = 0;

  constructor(config: Partial<SseConnectionConfig> = {}) {
    this.config = Object.freeze({ ...DEFAULT_SSE_CONFIG, ...config });
  }

  /** Current configuration (frozen copy). */
  getConfig(): SseConnectionConfig {
    return this.config;
  }

  /**
   * Accept an incoming SSE request: enforce per-IP limits, then return
   * an `SseConnection` that owns buffering, heartbeat, timeout, and teardown.
   *
   * Returns `{ ok: false, reason }` when the per-IP limit is exceeded (caller sends 429).
   */
  accept(
    request: FastifyRequest,
    reply: FastifyReply
  ):
    | { readonly ok: true; readonly connection: SseConnection }
    | { readonly ok: false; readonly reason: string } {
    const ip = request.ip;
    const ipCount = this.countByIp(ip);
    if (ipCount >= this.config.maxConnectionsPerIp) {
      return {
        ok: false,
        reason: `Too many SSE connections from ${ip} (${ipCount}/${this.config.maxConnectionsPerIp})`,
      };
    }

    const id = String(++this.nextId);
    const record: SseConnectionRecord = Object.freeze({
      id,
      ip,
      connectedAt: Date.now(),
    });

    const updated = new Map(this.connections);
    updated.set(id, record);
    this.connections = updated;

    const connection = new SseConnection(id, request, reply, this.config, () => {
      this.unregister(id);
    });

    return { ok: true, connection };
  }

  /** Register a new connection. Returns allowed: false if limit exceeded. */
  register(ip: string): ConnectionResult {
    const ipCount = this.countByIp(ip);
    if (ipCount >= this.config.maxConnectionsPerIp) {
      return {
        allowed: false,
        reason: `Too many SSE connections from ${ip} (${ipCount}/${this.config.maxConnectionsPerIp})`,
      };
    }

    const id = String(++this.nextId);
    const connection: SseConnectionRecord = Object.freeze({
      id,
      ip,
      connectedAt: Date.now(),
    });

    // Produce a new map with the added connection
    const updated = new Map(this.connections);
    updated.set(id, connection);
    this.connections = updated;

    return { allowed: true, connection };
  }

  /** Remove a connection by ID. */
  unregister(id: string): void {
    if (!this.connections.has(id)) return;
    const updated = new Map(this.connections);
    updated.delete(id);
    this.connections = updated;
  }

  /** Count active connections for a given IP. */
  countByIp(ip: string): number {
    let count = 0;
    for (const conn of this.connections.values()) {
      if (conn.ip === ip) count++;
    }
    return count;
  }

  /** Total active connections. */
  get totalConnections(): number {
    return this.connections.size;
  }

  /** Check whether a connection has exceeded its max lifetime. */
  isExpired(id: string, now: number = Date.now()): boolean {
    const conn = this.connections.get(id);
    if (!conn) return true;
    return now - conn.connectedAt >= this.config.connectionTimeoutMs;
  }
}
