/**
 * Circuit breaker + error rendering for origin-proxied routes, exercised
 * through the edge router (the only production caller).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import edgeRouter from "./edge-router.js";

const PROBLEM_JSON = "application/problem+json";
const RESERVATIONS_PATH = "/api/v1/venues";
const USERS_PATH = "/api/v1/users";

function createStatefulKv() {
  const store = new Map();
  return {
    store,
    get: vi.fn(async (key, type) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    }),
    put: vi.fn(async (key, value) => {
      store.set(key, value);
    }),
  };
}

function createEnv() {
  return {
    API_ORIGIN: "https://api.mattbutlerengineering.com",
    HEALTH_STATE: createStatefulKv(),
    MARKETING: { fetch: vi.fn(async () => new Response("<html></html>")) },
  };
}

let env;
const originalFetch = globalThis.fetch;

function get(path) {
  return edgeRouter.fetch(new Request(`https://mattbutlerengineering.com${path}`), env);
}

function problemResponse(status) {
  return new Response(JSON.stringify({ type: "about:blank", title: "Boom", status }), {
    status,
    headers: { "Content-Type": PROBLEM_JSON },
  });
}

describe("origin proxy circuit breaker", () => {
  beforeEach(() => {
    env = createEnv();
    globalThis.fetch = vi.fn(async () => problemResponse(500));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("opens after 3 origin 5xx and answers the 4th without calling the origin", async () => {
    for (let i = 0; i < 3; i++) await get(RESERVATIONS_PATH);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    const response = await get(RESERVATIONS_PATH);
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toContain(PROBLEM_JSON);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("isolates circuits per service: users 5xx does not open reservations", async () => {
    for (let i = 0; i < 3; i++) await get(USERS_PATH);
    globalThis.fetch.mockClear();
    globalThis.fetch.mockImplementation(async () => new Response("{}", { status: 200 }));

    const response = await get(RESERVATIONS_PATH);
    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const usersResponse = await get(USERS_PATH);
    expect(usersResponse.status).toBe(503);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the service's problem+json body on an /api origin 5xx", async () => {
    const response = await get(RESERVATIONS_PATH);
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toContain(PROBLEM_JSON);
    expect((await response.json()).title).toBe("Boom");
  });

  it("synthesizes problem+json when an /api origin 5xx is not problem+json", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("<html>bad gateway</html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        })
    );
    const response = await get(RESERVATIONS_PATH);
    expect(response.status).toBe(502);
    expect(response.headers.get("Content-Type")).toContain(PROBLEM_JSON);
    expect((await response.json()).title).toBeTruthy();
  });

  it("returns problem+json 503 for /public when the origin is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("connect refused");
    });
    const response = await get("/public/v1/venues/x");
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toContain(PROBLEM_JSON);
  });

  it("allows a probe after the open window and closes on success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 3; i++) await get(RESERVATIONS_PATH);
    expect((await get(RESERVATIONS_PATH)).status).toBe(503);

    vi.setSystemTime(new Date("2026-01-01T00:00:31Z"));
    globalThis.fetch.mockImplementation(async () => new Response("{}", { status: 200 }));
    expect((await get(RESERVATIONS_PATH)).status).toBe(200);
    expect((await get(RESERVATIONS_PATH)).status).toBe(200);
  });
});
