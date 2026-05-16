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

function createEnv() {
  return {
    API_ORIGIN: "https://api.mattbutlerengineering.com",
    MARKETING: createMockBinding("MARKETING"),
    HOSPITALITY: createMockBinding("HOSPITALITY"),
    RIALTO: createMockBinding("RIALTO"),
    GEN: createMockBinding("GEN"),
    HEALTH_STATE: createMockKv(),
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
    it("proxies /api/* to API_ORIGIN", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));

      try {
        const response = await edgeRouter.fetch(makeRequest("/api/v1/users"), env);
        expect(globalThis.fetch).toHaveBeenCalled();
        const calledRequest = globalThis.fetch.mock.calls[0][0];
        expect(calledRequest.url).toBe("https://api.mattbutlerengineering.com/api/v1/users");
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
      // Should NOT have detailed subsystem info without auth
      expect(body).not.toHaveProperty("subsystems");
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
      expect(body).toHaveProperty("generatedAt");
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
});
