/**
 * Tests for the edge topology registry (routes-config.json).
 *
 * TDD red phase: these tests define what the config must contain and
 * how the edge-router must consume it. They fail before refactoring.
 *
 * Coverage:
 * 1. Config structure / schema validation
 * 2. Routing derived from config (same behaviour as hardcoded tables)
 * 3. Cache headers derived from config
 * 4. wrangler.toml sync — config bindings match [[services]] entries
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ── Load config ─────────────────────────────────────────────────────────
const CONFIG_PATH = resolve(__dirname, "routes-config.json");
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));

// ── Load wrangler.toml (parse manually — no TOML dep needed) ────────────
const WRANGLER_PATH = resolve(__dirname, "wrangler.toml");
const wranglerRaw = readFileSync(WRANGLER_PATH, "utf-8");

/**
 * Extract [[services]] binding values from wrangler.toml.
 * Parses each `binding = "NAME"` line after a [[services]] header.
 */
function parseWranglerBindings(toml) {
  const bindings = [];
  const lines = toml.split("\n");
  let inServices = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "[[services]]") {
      inServices = true;
      continue;
    }
    if (trimmed.startsWith("[[") && trimmed !== "[[services]]") {
      inServices = false;
    }
    if (inServices) {
      const match = trimmed.match(/^binding\s*=\s*"([^"]+)"/);
      if (match) bindings.push(match[1]);
    }
  }
  return bindings;
}

// ── HTMLRewriter mock ──────────────────────────────────────────────────
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

import edgeRouter from "./edge-router.js";

// ── Helpers ──────────────────────────────────────────────────────────────
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

function makeRequest(path, options = {}) {
  const hostname = options.hostname || "mattbutlerengineering.com";
  return new Request(`https://${hostname}${path}`, {
    method: options.method || "GET",
    headers: options.headers || {},
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("routes-config.json schema", () => {
  it("has staticRoutes array", () => {
    expect(Array.isArray(config.staticRoutes)).toBe(true);
    expect(config.staticRoutes.length).toBeGreaterThan(0);
  });

  it("each staticRoute has required fields", () => {
    for (const route of config.staticRoutes) {
      expect(typeof route.prefix).toBe("string");
      expect(typeof route.binding).toBe("string");
      expect(typeof route.bindingOrigin).toBe("string");
      expect(typeof route.routeName).toBe("string");
      expect(typeof route.cacheClass).toBe("string");
    }
  });

  it("has services array with health paths", () => {
    expect(Array.isArray(config.services)).toBe(true);
    for (const svc of config.services) {
      expect(typeof svc.name).toBe("string");
      expect(typeof svc.healthPath).toBe("string");
      expect(typeof svc.kvMigrateKey).toBe("string");
    }
  });

  it("has kvKeys for ci, deploy pipelines, and feature flags", () => {
    expect(typeof config.kvKeys.ci).toBe("string");
    expect(typeof config.kvKeys.deployStatic).toBe("string");
    expect(typeof config.kvKeys.deployServices).toBe("string");
    expect(typeof config.kvKeys.deployInfrastructure).toBe("string");
    expect(typeof config.kvKeys.featureFlags).toBe("string");
  });

  it("has cacheClasses with hashedAssets and html policies", () => {
    expect(config.cacheClasses).toBeDefined();
    const cls = config.cacheClasses["static-site"];
    expect(typeof cls.hashedAssets).toBe("string");
    expect(typeof cls.html).toBe("string");
  });

  it("contains all expected static site routes", () => {
    const prefixes = config.staticRoutes.map((r) => r.prefix);
    expect(prefixes).toContain("/hospitality");
    expect(prefixes).toContain("/rialto");
    expect(prefixes).toContain("/gen");
    // catch-all marketing has empty prefix
    expect(prefixes).toContain("");
  });

  it("contains all expected service entries", () => {
    const names = config.services.map((s) => s.name);
    expect(names).toContain("users");
    expect(names).toContain("reservations");
    expect(names).toContain("agent");
  });

  it("marketing is the catch-all (empty prefix, last in list)", () => {
    const last = config.staticRoutes[config.staticRoutes.length - 1];
    expect(last.binding).toBe("MARKETING");
    expect(last.prefix).toBe("");
  });
});

describe("wrangler.toml sync: config bindings match [[services]] entries", () => {
  it("every staticRoute binding appears in wrangler.toml [[services]]", () => {
    const wranglerBindings = parseWranglerBindings(wranglerRaw);
    const configBindings = config.staticRoutes.map((r) => r.binding);
    for (const binding of configBindings) {
      expect(wranglerBindings).toContain(binding);
    }
  });

  it("every wrangler.toml [[services]] binding appears in config staticRoutes", () => {
    const wranglerBindings = parseWranglerBindings(wranglerRaw);
    const configBindings = config.staticRoutes.map((r) => r.binding);
    for (const binding of wranglerBindings) {
      expect(configBindings).toContain(binding);
    }
  });

  it("binding count matches between config and wrangler.toml", () => {
    const wranglerBindings = parseWranglerBindings(wranglerRaw);
    const configBindings = config.staticRoutes.map((r) => r.binding);
    expect(configBindings.length).toBe(wranglerBindings.length);
  });
});

describe("routing derived from config — byte-identical to hardcoded", () => {
  let env;

  beforeEach(() => {
    env = createEnv();
    vi.restoreAllMocks();
  });

  it("routes /hospitality/ to HOSPITALITY binding (from config)", async () => {
    const response = await edgeRouter.fetch(makeRequest("/hospitality/"), env);
    expect(env.HOSPITALITY.fetch).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("routes /rialto/ to RIALTO binding (from config)", async () => {
    const response = await edgeRouter.fetch(makeRequest("/rialto/"), env);
    expect(env.RIALTO.fetch).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("routes /gen/ to GEN binding (from config)", async () => {
    const response = await edgeRouter.fetch(makeRequest("/gen/"), env);
    expect(env.GEN.fetch).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("routes / to MARKETING binding (catch-all from config)", async () => {
    const response = await edgeRouter.fetch(makeRequest("/"), env);
    expect(env.MARKETING.fetch).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("strips /hospitality prefix (config-driven)", async () => {
    await edgeRouter.fetch(makeRequest("/hospitality/timeline"), env);
    const forwarded = env.HOSPITALITY.fetch.mock.calls[0][0];
    expect(new URL(forwarded.url).pathname).toBe("/timeline");
  });

  it("strips /gen prefix (config-driven)", async () => {
    await edgeRouter.fetch(makeRequest("/gen/editor"), env);
    const forwarded = env.GEN.fetch.mock.calls[0][0];
    expect(new URL(forwarded.url).pathname).toBe("/editor");
  });

  it("redirects /hospitality (no slash) to /hospitality/ (from config)", async () => {
    const response = await edgeRouter.fetch(makeRequest("/hospitality"), env);
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toContain("/hospitality/");
  });

  it("redirects /gen (no slash) to /gen/ (from config)", async () => {
    const response = await edgeRouter.fetch(makeRequest("/gen"), env);
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toContain("/gen/");
  });
});

describe("cache headers derived from config", () => {
  let env;

  beforeEach(() => {
    env = createEnv();
    vi.restoreAllMocks();
  });

  it("sets html cache policy from config for HTML responses", async () => {
    const response = await edgeRouter.fetch(makeRequest("/"), env);
    const expected = config.cacheClasses["static-site"].html;
    expect(response.headers.get("Cache-Control")).toBe(expected);
  });

  it("sets hashedAssets cache policy from config for /assets/ paths", async () => {
    env.MARKETING.fetch.mockResolvedValueOnce(
      new Response("/* css */", {
        status: 200,
        headers: { "Content-Type": "text/css" },
      })
    );
    const response = await edgeRouter.fetch(makeRequest("/assets/main.abc123.css"), env);
    const expected = config.cacheClasses["static-site"].hashedAssets;
    expect(response.headers.get("Cache-Control")).toBe(expected);
  });
});

describe("service health paths derived from config", () => {
  it("config service health paths match previously hardcoded values", () => {
    const usersEntry = config.services.find((s) => s.name === "users");
    const reservationsEntry = config.services.find((s) => s.name === "reservations");
    const agentEntry = config.services.find((s) => s.name === "agent");

    expect(usersEntry.healthPath).toBe("/health");
    expect(reservationsEntry.healthPath).toBe("/api/health");
    expect(agentEntry.healthPath).toBe("/api/gen/health");
  });

  it("config service KV migrate keys match previously hardcoded values", () => {
    const usersEntry = config.services.find((s) => s.name === "users");
    const reservationsEntry = config.services.find((s) => s.name === "reservations");
    const agentEntry = config.services.find((s) => s.name === "agent");

    expect(usersEntry.kvMigrateKey).toBe("migrate/users");
    expect(reservationsEntry.kvMigrateKey).toBe("migrate/reservations");
    expect(agentEntry.kvMigrateKey).toBe("migrate/agent");
  });

  it("config KV keys match previously hardcoded values", () => {
    expect(config.kvKeys.ci).toBe("ci/latest");
    expect(config.kvKeys.deployStatic).toBe("deploy/static");
    expect(config.kvKeys.deployServices).toBe("deploy/services");
    expect(config.kvKeys.deployInfrastructure).toBe("deploy/infrastructure");
    expect(config.kvKeys.featureFlags).toBe("flags/all");
  });
});
