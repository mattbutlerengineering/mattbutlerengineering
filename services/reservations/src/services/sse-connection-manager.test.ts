import { describe, it, expect } from "vitest";
import { SseConnectionManager, DEFAULT_SSE_CONFIG } from "./sse-connection-manager.js";

describe("SseConnectionManager", () => {
  describe("register", () => {
    it("allows connections under the per-IP limit", () => {
      const manager = new SseConnectionManager({ maxConnectionsPerIp: 3 });

      const r1 = manager.register("10.0.0.1");
      const r2 = manager.register("10.0.0.1");
      const r3 = manager.register("10.0.0.1");

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
      expect(manager.totalConnections).toBe(3);
    });

    it("rejects connections exceeding the per-IP limit", () => {
      const manager = new SseConnectionManager({ maxConnectionsPerIp: 2 });

      manager.register("10.0.0.1");
      manager.register("10.0.0.1");
      const r3 = manager.register("10.0.0.1");

      expect(r3.allowed).toBe(false);
      if (!r3.allowed) {
        expect(r3.reason).toContain("10.0.0.1");
        expect(r3.reason).toContain("2/2");
      }
    });

    it("tracks connections per-IP independently", () => {
      const manager = new SseConnectionManager({ maxConnectionsPerIp: 1 });

      const r1 = manager.register("10.0.0.1");
      const r2 = manager.register("10.0.0.2");

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(manager.totalConnections).toBe(2);
    });

    it("returns frozen connection objects", () => {
      const manager = new SseConnectionManager();
      const result = manager.register("10.0.0.1");

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(Object.isFrozen(result.connection)).toBe(true);
      }
    });
  });

  describe("unregister", () => {
    it("removes a connection by ID", () => {
      const manager = new SseConnectionManager({ maxConnectionsPerIp: 1 });
      const result = manager.register("10.0.0.1");
      expect(result.allowed).toBe(true);

      if (result.allowed) {
        manager.unregister(result.connection.id);
      }

      expect(manager.totalConnections).toBe(0);

      // Should allow a new connection from the same IP
      const r2 = manager.register("10.0.0.1");
      expect(r2.allowed).toBe(true);
    });

    it("is a no-op for unknown IDs", () => {
      const manager = new SseConnectionManager();
      manager.register("10.0.0.1");

      manager.unregister("nonexistent");
      expect(manager.totalConnections).toBe(1);
    });
  });

  describe("countByIp", () => {
    it("returns zero for unknown IPs", () => {
      const manager = new SseConnectionManager();
      expect(manager.countByIp("10.0.0.99")).toBe(0);
    });

    it("counts connections for a specific IP", () => {
      const manager = new SseConnectionManager();
      manager.register("10.0.0.1");
      manager.register("10.0.0.1");
      manager.register("10.0.0.2");

      expect(manager.countByIp("10.0.0.1")).toBe(2);
      expect(manager.countByIp("10.0.0.2")).toBe(1);
    });
  });

  describe("isExpired", () => {
    it("returns true for connections past their max lifetime", () => {
      const manager = new SseConnectionManager({ connectionTimeoutMs: 1000 });
      const result = manager.register("10.0.0.1");

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        const futureTime = Date.now() + 1001;
        expect(manager.isExpired(result.connection.id, futureTime)).toBe(true);
      }
    });

    it("returns false for connections within their lifetime", () => {
      const manager = new SseConnectionManager({ connectionTimeoutMs: 60000 });
      const result = manager.register("10.0.0.1");

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(manager.isExpired(result.connection.id)).toBe(false);
      }
    });

    it("returns true for unknown connection IDs", () => {
      const manager = new SseConnectionManager();
      expect(manager.isExpired("nonexistent")).toBe(true);
    });
  });

  describe("getConfig", () => {
    it("returns frozen config", () => {
      const manager = new SseConnectionManager();
      const config = manager.getConfig();
      expect(Object.isFrozen(config)).toBe(true);
    });

    it("uses defaults when no overrides provided", () => {
      const manager = new SseConnectionManager();
      const config = manager.getConfig();

      expect(config.maxConnectionsPerIp).toBe(DEFAULT_SSE_CONFIG.maxConnectionsPerIp);
      expect(config.connectionTimeoutMs).toBe(DEFAULT_SSE_CONFIG.connectionTimeoutMs);
      expect(config.maxEventBufferSize).toBe(DEFAULT_SSE_CONFIG.maxEventBufferSize);
      expect(config.heartbeatIntervalMs).toBe(DEFAULT_SSE_CONFIG.heartbeatIntervalMs);
    });

    it("merges partial overrides with defaults", () => {
      const manager = new SseConnectionManager({ maxConnectionsPerIp: 10 });
      const config = manager.getConfig();

      expect(config.maxConnectionsPerIp).toBe(10);
      expect(config.connectionTimeoutMs).toBe(DEFAULT_SSE_CONFIG.connectionTimeoutMs);
    });
  });
});
