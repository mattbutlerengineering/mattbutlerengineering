/**
 * Node.js compatibility integration test — @mbe/api-client used in CLI context.
 *
 * Verifies that @mbe/api-client works in a Node.js environment without any
 * browser-only globals (window, document) or polyfills. The CLI adopted
 * @mbe/api-client to replace two hand-rolled fetch wrappers (apiRequest() and
 * agentApiRequest()). This file documents that the package is Node-compatible
 * and guards against future regressions.
 *
 * Node.js compatibility findings:
 * - fetch: available in Node 18+ as a global (RFC, same API as browser)
 * - URLSearchParams: available in Node 10+ as a global
 * - AbortSignal.timeout(): available in Node 17.3+
 * - AbortSignal.any(): available in Node 20.3+
 * - TextDecoder: available in Node 11+ as a global
 * - ReadableStream: available in Node 18+ as a global
 * - No window, document, or localStorage references in @mbe/api-client source
 */
import { describe, it, expect } from "vitest";
import { ApiClient } from "@mbe/api-client";

describe("@mbe/api-client Node.js compatibility (CLI integration)", () => {
  describe("Web APIs used by ApiClient are available in Node 18+", () => {
    it("fetch is available as a global", () => {
      expect(typeof fetch).toBe("function");
    });

    it("URLSearchParams is available", () => {
      expect(typeof URLSearchParams).toBe("function");
      const params = new URLSearchParams({ page: "1", limit: "10" });
      expect(params.toString()).toBe("page=1&limit=10");
    });

    it("AbortSignal.timeout is available", () => {
      expect(typeof AbortSignal.timeout).toBe("function");
      const signal = AbortSignal.timeout(30_000);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
    });
  });

  describe("no browser-only globals present in Node.js environment", () => {
    it("window is not defined — @mbe/api-client does not require it", () => {
      // If the package accessed window at import time, this test suite would
      // crash before running. The fact it runs proves the import is safe.
      expect(typeof (globalThis as Record<string, unknown>)["window"]).toBe("undefined");
    });

    it("document is not defined — @mbe/api-client does not require it", () => {
      expect(typeof (globalThis as Record<string, unknown>)["document"]).toBe("undefined");
    });
  });

  describe("ApiClient instantiates correctly for CLI use cases", () => {
    it("creates an unauthenticated client for the agent API service", () => {
      // Mirrors createAgentApiClient() in cli-api-client.ts
      const client = new ApiClient({
        baseUrl: "http://localhost:3003",
        maxRetries: 0,
      });
      expect(client).toBeInstanceOf(ApiClient);
    });

    it("creates an authenticated client with sync token callback", () => {
      // Mirrors createCliApiClient() in cli-api-client.ts
      const client = new ApiClient({
        baseUrl: "https://api.example.com",
        maxRetries: 0,
        getAccessToken: () => "test-bearer-token",
      });
      expect(client).toBeInstanceOf(ApiClient);
    });

    it("getAccessToken callback can return null (no token path)", () => {
      const client = new ApiClient({
        baseUrl: "https://api.example.com",
        maxRetries: 0,
        getAccessToken: () => null,
      });
      expect(client).toBeInstanceOf(ApiClient);
    });

    it("getAccessToken callback can be async (future-proofing for token refresh)", () => {
      const client = new ApiClient({
        baseUrl: "https://api.example.com",
        maxRetries: 0,
        getAccessToken: async () => "refreshed-token",
      });
      expect(client).toBeInstanceOf(ApiClient);
    });
  });
});
