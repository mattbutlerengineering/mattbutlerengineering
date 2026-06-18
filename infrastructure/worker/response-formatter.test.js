/**
 * Tests for the response-formatter module.
 *
 * Covers security headers, cache-control rules, nonce generation,
 * HTML rewriting, and branded error pages — all without needing
 * a Worker runtime.
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildSecurityHeaders,
  cacheControlFor,
  generateNonce,
  addHeaders,
  brandedErrorPage,
  readCspPolicy,
} from "./response-formatter.js";

// ── HTMLRewriter mock (same as edge-router.test.js) ──────────────────
class MockHTMLRewriter {
  constructor() {
    this.handlers = [];
  }

  on(selector, handler) {
    this.handlers.push({ selector, handler });
    return this;
  }

  transform(response) {
    const scriptHandler = this.handlers.find((h) => h.selector === "script");
    if (!scriptHandler) return response;

    let nonce = "";
    const mockElement = {
      setAttribute(attr, value) {
        if (attr === "nonce") nonce = value;
      },
    };
    scriptHandler.handler.element(mockElement);

    if (!nonce) return response;

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

// ── topologyConfig mock (same structure as routes-config.json) ───────
// response-formatter.js needs cacheClasses. We mock the module so
// tests don't depend on the actual JSON file.
vi.mock("./routes-config.json", () => ({
  default: {
    cacheClasses: {
      "static-site": {
        hashedAssets: "public, max-age=31536000, immutable",
        html: "public, max-age=0, must-revalidate",
      },
    },
  },
}));

describe("response-formatter", () => {
  describe("generateNonce", () => {
    it("returns a 32-char hex string", () => {
      const nonce = generateNonce();
      expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    });

    it("returns a unique value each call", () => {
      const n1 = generateNonce();
      const n2 = generateNonce();
      expect(n1).not.toBe(n2);
    });
  });

  describe("buildSecurityHeaders", () => {
    it("returns HSTS header", () => {
      const headers = buildSecurityHeaders("abc123", null);
      expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    });

    it("returns X-Frame-Options DENY", () => {
      const headers = buildSecurityHeaders("abc123", null);
      expect(headers["X-Frame-Options"]).toBe("DENY");
    });

    it("returns X-Content-Type-Options nosniff", () => {
      const headers = buildSecurityHeaders("abc123", null);
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    });

    it("returns X-XSS-Protection 0", () => {
      const headers = buildSecurityHeaders("abc123", null);
      expect(headers["X-XSS-Protection"]).toBe("0");
    });

    it("returns Referrer-Policy", () => {
      const headers = buildSecurityHeaders("abc123", null);
      expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    });

    it("returns Permissions-Policy with camera, microphone, geolocation, payment", () => {
      const headers = buildSecurityHeaders("abc123", null);
      expect(headers["Permissions-Policy"]).toContain("camera=()");
      expect(headers["Permissions-Policy"]).toContain("microphone=()");
      expect(headers["Permissions-Policy"]).toContain("geolocation=()");
      expect(headers["Permissions-Policy"]).toContain("payment=()");
    });

    it("returns Content-Security-Policy with nonce in script-src", () => {
      const nonce = "deadbeef1234567890abcdef01234567";
      const headers = buildSecurityHeaders(nonce, null);
      expect(headers["Content-Security-Policy"]).toContain(`'nonce-${nonce}'`);
    });

    it("CSP includes default-src self", () => {
      const headers = buildSecurityHeaders("abc123", null);
      expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    });
  });

  describe("cacheControlFor", () => {
    it("returns immutable cache for /assets/ paths", () => {
      expect(cacheControlFor("/assets/main.abc123.css")).toBe(
        "public, max-age=31536000, immutable"
      );
    });

    it("returns null for non-asset paths (handled by addHeaders based on content-type)", () => {
      expect(cacheControlFor("/")).toBeNull();
      expect(cacheControlFor("/about")).toBeNull();
    });

    it("returns immutable for nested /assets/ paths", () => {
      expect(cacheControlFor("/hospitality/assets/chunk.abc.js")).toBe(
        "public, max-age=31536000, immutable"
      );
    });
  });

  describe("addHeaders", () => {
    it("adds security headers to a response", async () => {
      const nonce = generateNonce();
      const response = new Response("hello", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
      const result = addHeaders(response, "/", nonce, null);
      expect(result.headers.get("X-Frame-Options")).toBe("DENY");
      expect(result.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    });

    it("sets immutable cache for /assets/ path", async () => {
      const response = new Response("body { }", {
        status: 200,
        headers: { "Content-Type": "text/css" },
      });
      const result = addHeaders(response, "/assets/main.abc.css", generateNonce(), null);
      expect(result.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    });

    it("sets must-revalidate cache for HTML responses", async () => {
      const response = new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
      const result = addHeaders(response, "/", generateNonce(), null);
      expect(result.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    });

    it("injects nonce into <script> tags for HTML responses", async () => {
      const nonce = "deadbeef1234567890abcdef01234567";
      const response = new Response('<html><script type="module">;</script></html>', {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
      const result = addHeaders(response, "/", nonce, null);
      const body = await result.text();
      expect(body).toContain(`nonce="${nonce}"`);
    });

    it("does not inject nonce for non-HTML responses", async () => {
      const nonce = "deadbeef1234567890abcdef01234567";
      const response = new Response("body { color: red; }", {
        status: 200,
        headers: { "Content-Type": "text/css" },
      });
      const result = addHeaders(response, "/style.css", nonce, null);
      const body = await result.text();
      expect(body).not.toContain("nonce");
    });

    it("preserves response status code", async () => {
      const response = new Response("not found", { status: 404 });
      const result = addHeaders(response, "/missing", generateNonce(), null);
      expect(result.status).toBe(404);
    });
  });

  describe("brandedErrorPage", () => {
    it("returns a Response with the given status code", () => {
      const response = brandedErrorPage(503, "Service unavailable", "req-123");
      expect(response.status).toBe(503);
    });

    it("returns HTML content type", () => {
      const response = brandedErrorPage(502, "Bad gateway", "req-456");
      expect(response.headers.get("Content-Type")).toContain("text/html");
    });

    it("returns no-store cache control", () => {
      const response = brandedErrorPage(503, "Error", "req-789");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("includes request ID in HTML body", async () => {
      const response = brandedErrorPage(503, "Error", "my-request-id-xyz");
      const body = await response.text();
      expect(body).toContain("my-request-id-xyz");
    });

    it("adds security headers when nonce is provided", () => {
      const nonce = "deadbeef1234567890abcdef01234567";
      const response = brandedErrorPage(503, "Error", "req-id", nonce, null);
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    });

    it("does not add security headers when nonce is empty string", () => {
      const response = brandedErrorPage(503, "Error", "req-id", "");
      // When nonce is empty/falsy, security headers are NOT added
      expect(response.headers.get("X-Frame-Options")).toBeNull();
    });
  });

  describe("readCspPolicy", () => {
    it("returns parsed JSON from KV", async () => {
      const kv = {
        get: async (key, format) => {
          if (key === "security/csp" && format === "json") {
            return { "img-src": "'self' https://cdn.example.com" };
          }
          return null;
        },
      };
      const result = await readCspPolicy(kv);
      expect(result).toEqual({ "img-src": "'self' https://cdn.example.com" });
    });

    it("returns null when KV key is missing", async () => {
      const kv = { get: async () => null };
      const result = await readCspPolicy(kv);
      expect(result).toBeNull();
    });

    it("returns null when KV throws", async () => {
      const kv = {
        get: async () => {
          throw new Error("KV unavailable");
        },
      };
      const result = await readCspPolicy(kv);
      expect(result).toBeNull();
    });
  });
});
