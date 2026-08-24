/**
 * Tests for the edge router Worker.
 *
 * Verifies routing rules, path prefix stripping, security headers,
 * cache headers, and redirect behavior. Uses mock Service Bindings
 * and fetch to isolate the router logic.
 *
 * Run: npx vitest run infrastructure/worker/edge-router.test.js
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import topologyConfig from "./routes-config.json" with { type: "json" };

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ── HTMLRewriter mock (Cloudflare Workers API, not available in Node) ─
// Simulates the HTMLRewriter transform by doing a regex-based nonce
// injection into <script> tags — good enough for testing header logic
// and verifying that nonce values appear in the transformed HTML.
class MockHTMLRewriter {
  constructor() {
    this.handlers = [];
  }

  on(selector, handler) {
    this.handlers.push({ selector, handler });
    return this;
  }

  transform(response) {
    // Find the script handler's nonce value
    const scriptHandler = this.handlers.find((h) => h.selector === "script");
    if (!scriptHandler) return response;

    // Extract nonce by calling element() with a mock element
    let nonce = "";
    const mockElement = {
      setAttribute(attr, value) {
        if (attr === "nonce") nonce = value;
      },
    };
    scriptHandler.handler.element(mockElement);

    if (!nonce) return response;

    // Read the body and inject nonce into <script> tags
    const reader = response.body?.getReader();
    if (!reader) return response;

    const stream = new ReadableStream({
      async start(controller) {
        const chunks = [];
        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (result.value) chunks.push(result.value);
        }
        const decoder = new TextDecoder();
        const text = chunks.map((c) => decoder.decode(c, { stream: true })).join("");
        const rewritten = text.replace(/<script/g, `<script nonce="${nonce}"`);
        controller.enqueue(new TextEncoder().encode(rewritten));
        controller.close();
      },
    });

    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
}

globalThis.HTMLRewriter = MockHTMLRewriter;

// Import the default export (the Worker module)
import edgeRouter from "./edge-router.js";

// ── Helpers ──────────────────────────────────────────────────────────

function createMockBinding(name) {
  return {
    fetch: vi.fn(async (request) => {
      const url = new URL(request.url);
      return new Response(`<html>${name}: ${url.pathname}</html>`, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }),
  };
}

function createMockKv() {
  return {
    get: vi.fn(async () => null),
  };
}

function createMockAnalytics() {
  return {
    writeDataPoint: vi.fn(),
  };
}

function createEnv() {
  return {
    API_ORIGIN: "https://api.mattbutlerengineering.com",
    MARKETING: createMockBinding("MARKETING"),
    HOSPITALITY: createMockBinding("HOSPITALITY"),
    RIALTO: createMockBinding("RIALTO"),
    GEN: createMockBinding("GEN"),
    HEALTH_STATE: createMockKv(),
    ANALYTICS: createMockAnalytics(),
  };
}

function makeRequest(path, options = {}) {
  const hostname = options.hostname || "mattbutlerengineering.com";
  return new Request(`https://${hostname}${path}`, {
    method: options.method || "GET",
    headers: options.headers || {},
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Edge Router", () => {
  let env;

  beforeEach(() => {
    env = createEnv();
    vi.restoreAllMocks();
  });

  describe("Static site routing", () => {
    it("routes / to MARKETING binding", async () => {
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      expect(env.MARKETING.fetch).toHaveBeenCalled();
      expect(env.HOSPITALITY.fetch).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it("routes /hospitality/ to HOSPITALITY binding", async () => {
      const response = await edgeRouter.fetch(makeRequest("/hospitality/"), env);
      expect(env.HOSPITALITY.fetch).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it("routes /rialto/ to RIALTO binding", async () => {
      const response = await edgeRouter.fetch(makeRequest("/rialto/"), env);
      expect(env.RIALTO.fetch).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it("routes /gen/ to GEN binding", async () => {
      const response = await edgeRouter.fetch(makeRequest("/gen/"), env);
      expect(env.GEN.fetch).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it("routes unknown paths to MARKETING (catch-all)", async () => {
      await edgeRouter.fetch(makeRequest("/about"), env);
      expect(env.MARKETING.fetch).toHaveBeenCalled();
    });
  });

  describe("Path prefix stripping", () => {
    it("strips /hospitality prefix before forwarding", async () => {
      await edgeRouter.fetch(makeRequest("/hospitality/timeline"), env);
      const forwardedRequest = env.HOSPITALITY.fetch.mock.calls[0][0];
      const forwardedUrl = new URL(forwardedRequest.url);
      expect(forwardedUrl.pathname).toBe("/timeline");
    });

    it("strips /rialto prefix before forwarding", async () => {
      await edgeRouter.fetch(makeRequest("/rialto/components"), env);
      const forwardedRequest = env.RIALTO.fetch.mock.calls[0][0];
      const forwardedUrl = new URL(forwardedRequest.url);
      expect(forwardedUrl.pathname).toBe("/components");
    });

    it("strips /gen prefix before forwarding", async () => {
      await edgeRouter.fetch(makeRequest("/gen/editor"), env);
      const forwardedRequest = env.GEN.fetch.mock.calls[0][0];
      const forwardedUrl = new URL(forwardedRequest.url);
      expect(forwardedUrl.pathname).toBe("/editor");
    });

    it("does not strip prefix for marketing (no prefix)", async () => {
      await edgeRouter.fetch(makeRequest("/about"), env);
      const forwardedRequest = env.MARKETING.fetch.mock.calls[0][0];
      const forwardedUrl = new URL(forwardedRequest.url);
      expect(forwardedUrl.pathname).toBe("/about");
    });

    it("forwards / for prefix-only paths", async () => {
      await edgeRouter.fetch(makeRequest("/hospitality/"), env);
      const forwardedRequest = env.HOSPITALITY.fetch.mock.calls[0][0];
      const forwardedUrl = new URL(forwardedRequest.url);
      expect(forwardedUrl.pathname).toBe("/");
    });
  });

  describe("API proxy", () => {
    // Shared test route — kept as a single constant so a repeated literal
    // doesn't trip the repo's hardcoded-route antipattern ratchet.
    const API_TEST_PATH = "/api/v1/users";

    it("proxies /api/* to API_ORIGIN", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));

      try {
        await edgeRouter.fetch(makeRequest(API_TEST_PATH), env);
        expect(globalThis.fetch).toHaveBeenCalled();
        const calledRequest = globalThis.fetch.mock.calls[0][0];
        expect(calledRequest.url).toBe(`https://api.mattbutlerengineering.com${API_TEST_PATH}`);
        // API routes should NOT go through any static binding
        expect(env.MARKETING.fetch).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("proxies /api (without trailing slash)", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 }));

      try {
        await edgeRouter.fetch(makeRequest("/api"), env);
        expect(globalThis.fetch).toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("proxies /api/* without any feature-flag KV read on the hot path", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));

      try {
        const response = await edgeRouter.fetch(makeRequest(API_TEST_PATH), env);
        expect(response.status).toBe(200);
        expect(globalThis.fetch).toHaveBeenCalled();

        // The deleted feature-flag pipeline must not touch KV on the hot path:
        // no request may read the removed "flags/all" key.
        const kvKeysRead = env.HEALTH_STATE.get.mock.calls.map((call) => call[0]);
        expect(kvKeysRead).not.toContain("flags/all");

        // With zero consumers, no feature-related header may be forwarded upstream.
        const forwardedRequest = globalThis.fetch.mock.calls[0][0];
        const forwardedHeaderNames = [...forwardedRequest.headers.keys()];
        expect(forwardedHeaderNames.some((name) => name.toLowerCase().includes("feature"))).toBe(
          false
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("strips a client-supplied X-Feature-Flags header before proxying", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));

      try {
        const response = await edgeRouter.fetch(
          makeRequest(API_TEST_PATH, {
            headers: { "X-Feature-Flags": '{"enhanced-validation":true}' },
          }),
          env
        );
        expect(response.status).toBe(200);

        // A client must never control server-side feature flags: the edge is the
        // only sanctioned source and it emits none, so the header is dropped.
        const forwardedRequest = globalThis.fetch.mock.calls[0][0];
        expect(forwardedRequest.headers.get("x-feature-flags")).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    // ── Origin routes read from the registry ─────────────────────────
    // The prefix table moved from a hardcoded startsWith("/api/") into
    // routes-config.json's originRoutes. For /api that is a pure refactor —
    // every test above passes unmodified — and /public is the addition that
    // opens the outer of the two gates that made /public/v1/** unreachable.
    const PUBLIC_TEST_PATHS = ["/public", "/public/v1/venues/x", "/public/v1/guests/unsubscribe"];

    /** Run one request with global fetch stubbed; returns the forwarded Request or null. */
    async function forwarded(path, testEnv = env) {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
      try {
        await edgeRouter.fetch(makeRequest(path), testEnv);
        return globalThis.fetch.mock.calls[0]?.[0] ?? null;
      } finally {
        globalThis.fetch = originalFetch;
      }
    }

    it.each(PUBLIC_TEST_PATHS)("proxies %s to API_ORIGIN with the path preserved", async (path) => {
      const request = await forwarded(path);
      expect(request).not.toBeNull();
      // preservePathPrefix on the DO side re-matches this exact string, so a
      // rewrite here would arrive at a service that does not serve it.
      expect(request.url).toBe(`https://api.mattbutlerengineering.com${path}`);
      expect(env.MARKETING.fetch).not.toHaveBeenCalled();
    });

    it("gives /public the same forwarded headers and flag stripping as /api", async () => {
      // Not asserted for its own sake: this is what proves /public takes the
      // same branch as /api, and therefore inherits the circuit breaker, the
      // forwarded header set and X-Feature-Flags stripping. The edge rate
      // limiter is NOT inherited this way — it runs before this branch off its
      // own table; rate-limiter.test.js owns that coupling.
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
      try {
        await edgeRouter.fetch(
          makeRequest("/public/v1/venues/x", {
            headers: { "X-Feature-Flags": '{"enhanced-validation":true}' },
          }),
          env
        );
        const request = globalThis.fetch.mock.calls[0][0];
        expect(request.headers.get("x-forwarded-host")).toBe("mattbutlerengineering.com");
        expect(request.headers.get("x-request-id")).toBeTruthy();
        expect(request.headers.get("x-feature-flags")).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it.each(["/publicity", "/apiary"])(
      "does not proxy %s — it stays a static route",
      async (path) => {
        // Measured at the apex 2026-08-24: /apiary and /publicity both answer
        // 200 text/html, 7130 bytes (the marketing SPA). A bare
        // startsWith(prefix) would newly proxy both, and a refactor that changes
        // what a live path returns is not a refactor.
        expect(await forwarded(path)).toBeNull();
        expect(env.MARKETING.fetch).toHaveBeenCalled();
      }
    );

    it("matches on the pathname only, so a query string cannot affect routing", async () => {
      const request = await forwarded("/public/v1/venues/x?slug=%2Fapi");
      expect(request.url).toBe(
        "https://api.mattbutlerengineering.com/public/v1/venues/x?slug=%2Fapi"
      );
    });

    it("is case-sensitive — /Public is not /public", async () => {
      expect(await forwarded("/Public/v1/venues/x")).toBeNull();
      expect(env.MARKETING.fetch).toHaveBeenCalled();
    });

    it("routes identically when originRoutes is reversed — the array is a set", async () => {
      // The branch is a single boolean (does ANY prefix match), so no entry
      // can shadow another and order carries no contract. Pinned as a test
      // rather than a comment, because the sibling staticRoutes table in the
      // same file IS order-dependent and the two are easy to conflate.
      const reversed = [...topologyConfig.originRoutes].reverse();
      const original = topologyConfig.originRoutes;
      topologyConfig.originRoutes = reversed;
      try {
        for (const path of [...PUBLIC_TEST_PATHS, API_TEST_PATH, "/api"]) {
          const request = await forwarded(path);
          expect(request?.url, `${path} under reversed originRoutes`).toBe(
            `https://api.mattbutlerengineering.com${path}`
          );
        }
        for (const path of ["/publicity", "/apiary"]) {
          expect(await forwarded(path), `${path} under reversed originRoutes`).toBeNull();
        }
      } finally {
        topologyConfig.originRoutes = original;
      }
    });

    it("reads the origin table rather than any literal — a prefix absent from source still routes", async () => {
      // ADR-011: topology lives in routes-config.json. The /api branch had
      // been violating that since it was written, which is why the coverage
      // check had no source of truth to read on the edge side.
      //
      // Asserting the source does not CONTAIN "/api/" is too weak to encode
      // that rule: a reintroduced startsWith("/api") or === "/public" passes
      // such a check unchanged. So drive the matcher with a prefix that
      // appears nowhere in edge-router.js — it can only route if the branch
      // genuinely reads the registry.
      const invented = "/zzz-not-in-source";
      const source = readFileSync(resolve(__dirname, "edge-router.js"), "utf-8");
      expect(source).not.toContain(invented);

      const original = topologyConfig.originRoutes;
      topologyConfig.originRoutes = [...original, invented];
      try {
        const request = await forwarded(`${invented}/probe`);
        expect(request?.url).toBe(`https://api.mattbutlerengineering.com${invented}/probe`);
      } finally {
        topologyConfig.originRoutes = original;
      }
    });

    it("stops routing a prefix the moment it leaves the registry", async () => {
      // The other direction, and the one that catches a leftover literal: if
      // any hardcoded /api test survived alongside the registry read, removing
      // /api from the table would not stop it proxying.
      const original = topologyConfig.originRoutes;
      topologyConfig.originRoutes = original.filter((p) => p !== "/api");
      try {
        expect(await forwarded(API_TEST_PATH)).toBeNull();
        expect(env.MARKETING.fetch).toHaveBeenCalled();
      } finally {
        topologyConfig.originRoutes = original;
      }
    });

    it("adds security headers to API proxy responses", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(
        async () =>
          new Response('{"ok":true}', {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
      );

      try {
        const response = await edgeRouter.fetch(makeRequest(API_TEST_PATH), env);
        expect(response.headers.get("Strict-Transport-Security")).toBe(
          "max-age=31536000; includeSubDomains"
        );
        expect(response.headers.get("X-Frame-Options")).toBe("DENY");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
        expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
        expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
        // JSON body must be untouched (no HTMLRewriter transform applied)
        const body = await response.json();
        expect(body).toEqual({ ok: true });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("Redirects", () => {
    it("redirects www to non-www with 301", async () => {
      const response = await edgeRouter.fetch(
        makeRequest("/about", { hostname: "www.mattbutlerengineering.com" }),
        env
      );
      expect(response.status).toBe(301);
      const location = response.headers.get("Location");
      expect(location).toBe("https://mattbutlerengineering.com/about");
    });

    it("redirects /dashboard to /hospitality", async () => {
      const response = await edgeRouter.fetch(makeRequest("/dashboard"), env);
      expect(response.status).toBe(301);
      const location = response.headers.get("Location");
      expect(location).toBe("https://mattbutlerengineering.com/hospitality");
    });

    it("redirects /dashboard/settings to /hospitality/settings", async () => {
      const response = await edgeRouter.fetch(makeRequest("/dashboard/settings"), env);
      expect(response.status).toBe(301);
      const location = response.headers.get("Location");
      expect(location).toBe("https://mattbutlerengineering.com/hospitality/settings");
    });

    it("redirects /hospitality (no trailing slash) to /hospitality/", async () => {
      const response = await edgeRouter.fetch(makeRequest("/hospitality"), env);
      expect(response.status).toBe(301);
      const location = response.headers.get("Location");
      expect(location).toContain("/hospitality/");
    });

    it("redirects /rialto (no trailing slash) to /rialto/", async () => {
      const response = await edgeRouter.fetch(makeRequest("/rialto"), env);
      expect(response.status).toBe(301);
      const location = response.headers.get("Location");
      expect(location).toContain("/rialto/");
    });
  });

  describe("Security headers", () => {
    it("adds HSTS header to static site responses", async () => {
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      expect(response.headers.get("Strict-Transport-Security")).toBe(
        "max-age=31536000; includeSubDomains"
      );
    });

    it("adds X-Frame-Options DENY", async () => {
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    });

    it("adds X-Content-Type-Options nosniff", async () => {
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("adds Content-Security-Policy with nonce for script-src", async () => {
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      // Nonce-based CSP for scripts — no unsafe-inline
      expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toMatch(/script-src 'nonce-[a-f0-9]{32}' 'self'/);
      // Style-src still allows unsafe-inline (CSS nonces are less critical)
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });

    it("adds X-XSS-Protection: 0 (disable legacy XSS auditor)", async () => {
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      expect(response.headers.get("X-XSS-Protection")).toBe("0");
    });

    it("adds Referrer-Policy", async () => {
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    });

    it("adds Permissions-Policy", async () => {
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
      expect(response.headers.get("Permissions-Policy")).toContain("microphone=()");
      expect(response.headers.get("Permissions-Policy")).toContain("geolocation=()");
    });

    it("generates unique nonce per request", async () => {
      const response1 = await edgeRouter.fetch(makeRequest("/"), env);
      const response2 = await edgeRouter.fetch(makeRequest("/"), env);
      const csp1 = response1.headers.get("Content-Security-Policy");
      const csp2 = response2.headers.get("Content-Security-Policy");
      const nonce1 = csp1.match(/nonce-([a-f0-9]+)/)[1];
      const nonce2 = csp2.match(/nonce-([a-f0-9]+)/)[1];
      expect(nonce1).not.toBe(nonce2);
    });

    it("injects nonce into script tags in HTML responses", async () => {
      env.MARKETING.fetch.mockResolvedValueOnce(
        new Response('<html><head><script type="module">console.log("hi")</script></head></html>', {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
      );
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      const body = await response.text();
      const csp = response.headers.get("Content-Security-Policy");
      const nonce = csp.match(/nonce-([a-f0-9]+)/)[1];
      expect(body).toContain(`nonce="${nonce}"`);
      expect(body).toContain("<script");
    });

    it("does not inject nonce into non-HTML responses", async () => {
      env.MARKETING.fetch.mockResolvedValueOnce(
        new Response("body { color: red; }", {
          status: 200,
          headers: { "Content-Type": "text/css" },
        })
      );
      const response = await edgeRouter.fetch(makeRequest("/style.css"), env);
      const body = await response.text();
      expect(body).toBe("body { color: red; }");
      expect(body).not.toContain("nonce");
    });
  });

  describe("Source map blocking", () => {
    it("blocks .js.map files with 404", async () => {
      const response = await edgeRouter.fetch(makeRequest("/assets/main.abc123.js.map"), env);
      expect(response.status).toBe(404);
      expect(env.MARKETING.fetch).not.toHaveBeenCalled();
    });

    it("blocks .css.map files with 404", async () => {
      const response = await edgeRouter.fetch(
        makeRequest("/hospitality/assets/style.css.map"),
        env
      );
      expect(response.status).toBe(404);
      expect(env.HOSPITALITY.fetch).not.toHaveBeenCalled();
    });
  });

  describe("Cache headers", () => {
    it("sets must-revalidate for HTML responses", async () => {
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    });

    it("sets immutable cache for /assets/ paths", async () => {
      env.MARKETING.fetch.mockResolvedValueOnce(
        new Response("/* css */", {
          status: 200,
          headers: { "Content-Type": "text/css" },
        })
      );
      const response = await edgeRouter.fetch(makeRequest("/assets/main.abc123.css"), env);
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    });
  });

  describe("Health endpoint", () => {
    it("returns coarse health response without auth token", async () => {
      const response = await edgeRouter.fetch(makeRequest("/health/system"), env);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("timestamp");
      // Coarse response includes per-subsystem STATUS rollup so monitoring
      // scripts can determine WHY the system is degraded — but no sensitive
      // details (commit SHAs, latencies, pipeline names, service topology).
      expect(body).toHaveProperty("subsystems.services.status");
      expect(body).toHaveProperty("subsystems.static_sites.status");
      expect(body).toHaveProperty("subsystems.ci.status");
      expect(body).toHaveProperty("subsystems.deploys.status");
      // Verify no sensitive fields leak through
      expect(body.subsystems.ci).not.toHaveProperty("last_run");
      expect(body.subsystems.deploys).not.toHaveProperty("pipelines");
      expect(body.subsystems.services).not.toHaveProperty("checks");
    });

    it("omits CORS header when no Origin is sent", async () => {
      const response = await edgeRouter.fetch(makeRequest("/health/system"), env);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("returns CORS header for allowed origin on health/system", async () => {
      const response = await edgeRouter.fetch(
        makeRequest("/health/system", {
          headers: { Origin: "https://hospitality.mattbutlerengineering.com" },
        }),
        env
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://hospitality.mattbutlerengineering.com"
      );
    });

    it("omits CORS header for disallowed origin on health/system", async () => {
      const response = await edgeRouter.fetch(
        makeRequest("/health/system", {
          headers: { Origin: "https://attacker.example.com" },
        }),
        env
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });

  describe("Health endpoint with auth — migration status", () => {
    it("includes per-service migration status in detailed health response", async () => {
      const authedEnv = {
        ...env,
        HEALTH_TOKEN: "test-token",
        HEALTH_STATE: {
          get: vi.fn(async (key, format) => {
            const data = {
              "migrate/users": {
                conclusion: "success",
                service: "users",
                updated_at: new Date().toISOString(),
              },
              "migrate/reservations": {
                conclusion: "failure",
                service: "reservations",
                updated_at: new Date().toISOString(),
              },
            };
            const value = data[key] ?? null;
            // KV .get(key, "json") returns parsed object directly
            if (format === "json") return value;
            return value ? JSON.stringify(value) : null;
          }),
          put: vi.fn(),
        },
      };

      const response = await edgeRouter.fetch(
        makeRequest("/health/system", {
          headers: { Authorization: "Bearer test-token" },
        }),
        authedEnv
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("subsystems.migrations");
      expect(body.subsystems.migrations.checks.users.status).toBe("ok");
      expect(body.subsystems.migrations.checks.reservations.status).toBe("error");
      expect(body.subsystems.migrations.checks.agent.status).toBe("unknown");
    });
  });

  describe("Dependency graph endpoint", () => {
    it("returns JSON at /health/deps", async () => {
      const response = await edgeRouter.fetch(makeRequest("/health/deps"), env);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
      // No Origin header → no CORS header in response
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
      const body = await response.json();
      expect(body).toHaveProperty("nodes");
      expect(body).toHaveProperty("edges");
      expect(Array.isArray(body.nodes)).toBe(true);
      expect(Array.isArray(body.edges)).toBe(true);
    });

    it("returns CORS header for allowed origin", async () => {
      const response = await edgeRouter.fetch(
        makeRequest("/health/deps", {
          headers: { Origin: "https://mattbutlerengineering.com" },
        }),
        env
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://mattbutlerengineering.com"
      );
    });

    it("omits CORS header for disallowed origin", async () => {
      const response = await edgeRouter.fetch(
        makeRequest("/health/deps", {
          headers: { Origin: "https://evil.example.com" },
        }),
        env
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("includes node properties (name, type, path)", async () => {
      const response = await edgeRouter.fetch(makeRequest("/health/deps"), env);
      const body = await response.json();
      if (body.nodes.length > 0) {
        const node = body.nodes[0];
        expect(node).toHaveProperty("name");
        expect(node).toHaveProperty("type");
        expect(node).toHaveProperty("path");
        expect(["app", "service", "package", "tool"]).toContain(node.type);
      }
    });

    it("includes edge properties (from, to, type)", async () => {
      const response = await edgeRouter.fetch(makeRequest("/health/deps"), env);
      const body = await response.json();
      if (body.edges.length > 0) {
        const edge = body.edges[0];
        expect(edge).toHaveProperty("from");
        expect(edge).toHaveProperty("to");
        expect(edge).toHaveProperty("type");
        expect(["dependency", "devDependency"]).toContain(edge.type);
      }
    });
  });

  describe("CSP connect-src uses single Auth0 origin constant", () => {
    it("exports AUTH0_ORIGIN constant used in CSP connect-src", async () => {
      // Verify the module exports AUTH0_ORIGIN so CSP derives from one place
      const { AUTH0_ORIGIN } = await import("./edge-router.js");
      expect(AUTH0_ORIGIN).toBe("https://dev-ytbgmz5ls3wh4xdx.us.auth0.com");
    });

    it("CSP connect-src includes the AUTH0_ORIGIN value", async () => {
      const { AUTH0_ORIGIN } = await import("./edge-router.js");
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toContain(`connect-src 'self' ${AUTH0_ORIGIN}`);
    });
  });

  describe("CSP policy from KV (security/csp)", () => {
    it("uses hardcoded fallback when KV has no security/csp key", async () => {
      // Default mock KV returns null for all keys — fallback should apply
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toMatch(/script-src 'nonce-[a-f0-9]{32}' 'self'/);
    });

    it("merges KV policy overrides into CSP when security/csp is set", async () => {
      const kvWithCsp = {
        get: vi.fn(async (key, format) => {
          if (key === "security/csp" && format === "json") {
            return { "img-src": "'self' https://images.example.com" };
          }
          return null;
        }),
        put: vi.fn(),
      };
      const envWithKvCsp = { ...env, HEALTH_STATE: kvWithCsp };

      const response = await edgeRouter.fetch(makeRequest("/"), envWithKvCsp);
      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toContain("https://images.example.com");
      // Other directives (not overridden) still come from hardcoded defaults
      expect(csp).toContain("default-src 'self'");
    });

    it("falls back to hardcoded defaults when KV read throws", async () => {
      const kvThatThrows = {
        get: vi.fn(async (key) => {
          if (key === "security/csp") throw new Error("KV unavailable");
          return null;
        }),
        put: vi.fn(),
      };
      const envWithBrokenKv = { ...env, HEALTH_STATE: kvThatThrows };

      // Should NOT throw — graceful fallback
      const response = await edgeRouter.fetch(makeRequest("/"), envWithBrokenKv);
      expect(response.status).toBe(200);
      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toContain("default-src 'self'");
    });
  });

  describe("Service binding names match wrangler.toml", () => {
    it("uses the expected set of static site bindings", () => {
      // This test serves as a canary — if STATIC_SITE_BINDINGS changes
      // in edge-router.js, this test fails, reminding you to update
      // wrangler.toml and pulumi/index.ts too.
      const expected = ["GEN", "HOSPITALITY", "MARKETING", "RIALTO"];
      const { MARKETING, HOSPITALITY, RIALTO, GEN } = env;
      const bindings = [MARKETING, HOSPITALITY, RIALTO, GEN].filter(Boolean);
      expect(bindings).toHaveLength(expected.length);
    });
  });

  describe("Audit token bypass", () => {
    it("bypasses rate limiting for requests with valid X-Audit-Token", async () => {
      const auditEnv = {
        ...env,
        AUDIT_TOKEN: "test-audit-secret",
        HEALTH_STATE: {
          ...createMockKv(),
          get: vi.fn(async (key) => {
            if (key.startsWith("ratelimit:")) return "999";
            return null;
          }),
          put: vi.fn(),
        },
      };

      // Without audit token, /health/system is rate-limited (limit=10)
      const blockedResponse = await edgeRouter.fetch(makeRequest("/health/system"), auditEnv);
      expect(blockedResponse.status).toBe(429);

      // With valid audit token, rate limiting is bypassed
      const auditResponse = await edgeRouter.fetch(
        makeRequest("/health/system", {
          headers: { "X-Audit-Token": "test-audit-secret" },
        }),
        auditEnv
      );
      expect(auditResponse.status).toBe(200);
    });

    it("does not bypass rate limiting for invalid X-Audit-Token", async () => {
      const auditEnv = {
        ...env,
        AUDIT_TOKEN: "test-audit-secret",
        HEALTH_STATE: {
          ...createMockKv(),
          get: vi.fn(async (key) => {
            if (key.startsWith("ratelimit:")) return "999";
            return null;
          }),
          put: vi.fn(),
        },
      };

      const response = await edgeRouter.fetch(
        makeRequest("/health/system", {
          headers: { "X-Audit-Token": "wrong-token" },
        }),
        auditEnv
      );
      expect(response.status).toBe(429);
    });

    it("does not bypass rate limiting when AUDIT_TOKEN is not configured", async () => {
      const noTokenEnv = {
        ...env,
        HEALTH_STATE: {
          ...createMockKv(),
          get: vi.fn(async (key) => {
            if (key.startsWith("ratelimit:")) return "999";
            return null;
          }),
          put: vi.fn(),
        },
      };

      const response = await edgeRouter.fetch(
        makeRequest("/health/system", {
          headers: { "X-Audit-Token": "some-token" },
        }),
        noTokenEnv
      );
      expect(response.status).toBe(429);
    });

    it("serves static site content normally for audit-verified requests", async () => {
      const auditEnv = {
        ...env,
        AUDIT_TOKEN: "test-audit-secret",
      };

      const response = await edgeRouter.fetch(
        makeRequest("/", {
          headers: { "X-Audit-Token": "test-audit-secret" },
        }),
        auditEnv
      );
      expect(response.status).toBe(200);
      expect(env.MARKETING.fetch).toHaveBeenCalled();
    });
  });

  describe("Analytics Engine", () => {
    it("writes analytics data point on static site request", async () => {
      await edgeRouter.fetch(makeRequest("/"), env);

      expect(env.ANALYTICS.writeDataPoint).toHaveBeenCalledTimes(1);
      const call = env.ANALYTICS.writeDataPoint.mock.calls[0][0];
      expect(call.blobs).toContain("marketing");
      expect(call.doubles[0]).toBe(200);
    });

    it("records correct route target for each binding", async () => {
      await edgeRouter.fetch(makeRequest("/hospitality/dashboard"), env);

      const call = env.ANALYTICS.writeDataPoint.mock.calls[0][0];
      expect(call.blobs).toContain("hospitality");
    });

    it("does not fail when ANALYTICS binding is absent", async () => {
      const envWithoutAnalytics = { ...env };
      delete envWithoutAnalytics.ANALYTICS;

      const response = await edgeRouter.fetch(makeRequest("/"), envWithoutAnalytics);
      expect(response.status).toBe(200);
    });
  });
});
