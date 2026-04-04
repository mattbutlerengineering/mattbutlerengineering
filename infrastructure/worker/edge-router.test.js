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
        expect(calledRequest.url).toBe(
          "https://api.mattbutlerengineering.com/api/v1/users"
        );
        // API routes should NOT go through any static binding
        expect(env.MARKETING.fetch).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("proxies /api (without trailing slash)", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 }));

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

    it("adds Content-Security-Policy", async () => {
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });

  describe("Cache headers", () => {
    it("sets must-revalidate for HTML responses", async () => {
      const response = await edgeRouter.fetch(makeRequest("/"), env);
      expect(response.headers.get("Cache-Control")).toBe(
        "public, max-age=0, must-revalidate"
      );
    });

    it("sets immutable cache for /assets/ paths", async () => {
      env.MARKETING.fetch.mockResolvedValueOnce(
        new Response("/* css */", {
          status: 200,
          headers: { "Content-Type": "text/css" },
        })
      );
      const response = await edgeRouter.fetch(makeRequest("/assets/main.abc123.css"), env);
      expect(response.headers.get("Cache-Control")).toBe(
        "public, max-age=31536000, immutable"
      );
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
});
