/**
 * Host-based routing (#7709): eat-sheet.com serves the hospitality app at the
 * root, while mattbutlerengineering.com keeps its path-prefix routing.
 *
 * Kept apart from edge-router.test.js (already past the 800-line budget).
 * Run: npx vitest run infrastructure/worker/edge-router-host-routes.test.js
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import topologyConfig from "./routes-config.json" with { type: "json" };

// HTMLRewriter is a Workers runtime API; addHeaders only needs `.on().transform()`.
class PassThroughHTMLRewriter {
  on() {
    return this;
  }
  transform(response) {
    return response;
  }
}
globalThis.HTMLRewriter = PassThroughHTMLRewriter;

const { default: edgeRouter } = await import("./edge-router.js");

const EAT_SHEET = "eat-sheet.com";
const MBE = "mattbutlerengineering.com";

function createMockBinding(name, extraHeaders = {}) {
  return {
    fetch: vi.fn(async (request) => {
      const url = new URL(request.url);
      return new Response(`<html>${name}: ${url.pathname}</html>`, {
        status: 200,
        headers: { "Content-Type": "text/html", ...extraHeaders },
      });
    }),
  };
}

function createEnv() {
  return {
    API_ORIGIN: "https://api.mattbutlerengineering.com",
    MARKETING: createMockBinding("MARKETING"),
    HOSPITALITY: createMockBinding("HOSPITALITY"),
    RIALTO: createMockBinding("RIALTO"),
    GEN: createMockBinding("GEN"),
    HEALTH_STATE: { get: vi.fn(async () => null) },
    ANALYTICS: { writeDataPoint: vi.fn() },
  };
}

function request(hostname, path) {
  return new Request(`https://${hostname}${path}`);
}

/** Path the HOSPITALITY binding was asked for, or null when it was not called. */
function hospitalityPath(env) {
  const call = env.HOSPITALITY.fetch.mock.calls[0];
  return call ? new URL(call[0].url).pathname : null;
}

describe("Edge Router — eat-sheet.com host routing", () => {
  let env;

  beforeEach(() => {
    env = createEnv();
  });

  it("declares eat-sheet.com in routes-config.json hostRoutes, bound to the hospitality route", () => {
    const entry = topologyConfig.hostRoutes.find((h) => h.host === EAT_SHEET);
    expect(entry).toBeDefined();
    const route = topologyConfig.staticRoutes.find((r) => r.routeName === entry.routeName);
    expect(route?.binding).toBe("HOSPITALITY");
  });

  it.each([
    ["/", "/"],
    ["/assets/index-abc.js", "/assets/index-abc.js"],
    ["/hospitality/assets/index-abc.js", "/assets/index-abc.js"],
    ["/hospitality", "/"],
    ["/book/some-venue", "/book/some-venue"],
    ["/reservations/manage", "/reservations/manage"],
    ["/rialto", "/rialto"],
    ["/gen/whatever", "/gen/whatever"],
    ["/about", "/about"],
  ])("serves %s from the hospitality binding as %s", async (path, forwarded) => {
    const response = await edgeRouter.fetch(request(EAT_SHEET, path), env);
    expect(response.status).toBe(200);
    expect(hospitalityPath(env)).toBe(forwarded);
    expect(env.MARKETING.fetch).not.toHaveBeenCalled();
    expect(env.RIALTO.fetch).not.toHaveBeenCalled();
    expect(env.GEN.fetch).not.toHaveBeenCalled();
  });

  it("does not strip a prefix that only shares leading characters (/hospitalityx)", async () => {
    await edgeRouter.fetch(request(EAT_SHEET, "/hospitalityx"), env);
    expect(hospitalityPath(env)).toBe("/hospitalityx");
  });

  it("does not apply the legacy /dashboard → /hospitality redirect", async () => {
    const response = await edgeRouter.fetch(request(EAT_SHEET, "/dashboard"), env);
    expect(response.status).toBe(200);
    expect(hospitalityPath(env)).toBe("/dashboard");
  });

  it("redirects www.eat-sheet.com to the apex, keeping path and query", async () => {
    const response = await edgeRouter.fetch(
      request(`www.${EAT_SHEET}`, "/book/venue?party=2"),
      env
    );
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://eat-sheet.com/book/venue?party=2");
  });

  it("rewrites an app redirect to the root, not under /hospitality", async () => {
    env.HOSPITALITY.fetch.mockImplementationOnce(
      async () => new Response(null, { status: 301, headers: { Location: "/settings/" } })
    );
    const response = await edgeRouter.fetch(request(EAT_SHEET, "/settings"), env);
    expect(response.headers.get("Location")).toBe("https://eat-sheet.com/settings/");
  });

  it("sends a CSP whose connect-src allows same-origin API calls and Auth0", async () => {
    const response = await edgeRouter.fetch(request(EAT_SHEET, "/"), env);
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toMatch(/connect-src 'self' https:\/\/[^ ]+\.auth0\.com/);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows the apex origin in connect-src on eat-sheet.com (hospitality's VITE_API_URL is cross-origin there)", async () => {
    const response = await edgeRouter.fetch(request(EAT_SHEET, "/"), env);
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toContain("https://mattbutlerengineering.com");
  });

  it("does not add the apex origin to connect-src on mattbutlerengineering.com (already same-origin)", async () => {
    const response = await edgeRouter.fetch(request(MBE, "/hospitality"), env);
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).not.toContain("https://mattbutlerengineering.com ");
  });

  it("records the hospitality route name in analytics", async () => {
    await edgeRouter.fetch(request(EAT_SHEET, "/"), env);
    const point = env.ANALYTICS.writeDataPoint.mock.calls[0][0];
    expect(point.blobs[0]).toBe("hospitality");
  });

  describe("origin routes", () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it.each(topologyConfig.originRoutes.map((prefix) => `${prefix}/v1/venues/x`))(
      "proxies %s to the same API origin as mattbutlerengineering.com",
      async (path) => {
        await edgeRouter.fetch(request(EAT_SHEET, path), env);
        const forwarded = globalThis.fetch.mock.calls[0][0];
        expect(forwarded.url).toBe(`https://api.mattbutlerengineering.com${path}`);
        expect(forwarded.headers.get("X-Forwarded-Host")).toBe(EAT_SHEET);
        expect(env.HOSPITALITY.fetch).not.toHaveBeenCalled();
      }
    );
  });
});

describe("Edge Router — mattbutlerengineering.com unchanged by host routes", () => {
  let env;

  beforeEach(() => {
    env = createEnv();
  });

  it.each([
    ["/", "MARKETING", "/"],
    ["/about", "MARKETING", "/about"],
    ["/hospitality/book/x", "HOSPITALITY", "/book/x"],
    ["/rialto/button", "RIALTO", "/button"],
    ["/gen/x", "GEN", "/x"],
  ])("routes %s to %s as %s", async (path, binding, forwarded) => {
    await edgeRouter.fetch(request(MBE, path), env);
    const call = env[binding].fetch.mock.calls[0];
    expect(new URL(call[0].url).pathname).toBe(forwarded);
  });

  it("still redirects /dashboard to /hospitality", async () => {
    const response = await edgeRouter.fetch(request(MBE, "/dashboard/settings"), env);
    expect(response.headers.get("Location")).toBe(
      "https://mattbutlerengineering.com/hospitality/settings"
    );
  });

  it("still rewrites an app redirect under the /hospitality prefix", async () => {
    env.HOSPITALITY.fetch.mockImplementationOnce(
      async () => new Response(null, { status: 301, headers: { Location: "/settings/" } })
    );
    const response = await edgeRouter.fetch(request(MBE, "/hospitality/settings"), env);
    expect(response.headers.get("Location")).toBe(
      "https://mattbutlerengineering.com/hospitality/settings/"
    );
  });
});
