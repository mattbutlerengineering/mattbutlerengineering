import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { validateAuth0Config, fetchAuth0TokensWithRetry } from "../auth-helpers.js";
import type { Auth0Config } from "../auth-helpers.js";

const VALID_CONFIG: Auth0Config = {
  domain: "dev-test.us.auth0.com",
  clientId: "test-client-id",
  audience: "https://api.example.com",
  email: "test@example.com",
  password: "test-password",
};

const VALID_TOKEN_RESPONSE = {
  access_token: "test-access-token",
  id_token: "test-id-token",
  token_type: "Bearer",
  expires_in: 86400,
};

describe("validateAuth0Config", () => {
  it("returns config when all required env vars are present", () => {
    const env = {
      E2E_AUTH0_DOMAIN: "dev-test.us.auth0.com",
      E2E_AUTH0_CLIENT_ID: "test-client-id",
      E2E_AUTH0_AUDIENCE: "https://api.example.com",
      E2E_AUTH_EMAIL: "test@example.com",
      E2E_AUTH_PASSWORD: "test-password",
    };

    const config = validateAuth0Config(env);

    expect(config).toEqual(VALID_CONFIG);
  });

  it("throws with a clear message when E2E_AUTH0_DOMAIN is missing", () => {
    const env = {
      E2E_AUTH0_CLIENT_ID: "test-client-id",
      E2E_AUTH0_AUDIENCE: "https://api.example.com",
      E2E_AUTH_EMAIL: "test@example.com",
      E2E_AUTH_PASSWORD: "test-password",
    };

    expect(() => validateAuth0Config(env)).toThrow("E2E_AUTH0_DOMAIN");
  });

  it("throws with a clear message when E2E_AUTH0_CLIENT_ID is missing", () => {
    const env = {
      E2E_AUTH0_DOMAIN: "dev-test.us.auth0.com",
      E2E_AUTH0_AUDIENCE: "https://api.example.com",
      E2E_AUTH_EMAIL: "test@example.com",
      E2E_AUTH_PASSWORD: "test-password",
    };

    expect(() => validateAuth0Config(env)).toThrow("E2E_AUTH0_CLIENT_ID");
  });

  it("throws with a clear message when E2E_AUTH0_AUDIENCE is missing", () => {
    const env = {
      E2E_AUTH0_DOMAIN: "dev-test.us.auth0.com",
      E2E_AUTH0_CLIENT_ID: "test-client-id",
      E2E_AUTH_EMAIL: "test@example.com",
      E2E_AUTH_PASSWORD: "test-password",
    };

    expect(() => validateAuth0Config(env)).toThrow("E2E_AUTH0_AUDIENCE");
  });

  it("throws with a clear message when E2E_AUTH_EMAIL is missing", () => {
    const env = {
      E2E_AUTH0_DOMAIN: "dev-test.us.auth0.com",
      E2E_AUTH0_CLIENT_ID: "test-client-id",
      E2E_AUTH0_AUDIENCE: "https://api.example.com",
      E2E_AUTH_PASSWORD: "test-password",
    };

    expect(() => validateAuth0Config(env)).toThrow("E2E_AUTH_EMAIL");
  });

  it("throws with a clear message when E2E_AUTH_PASSWORD is missing", () => {
    const env = {
      E2E_AUTH0_DOMAIN: "dev-test.us.auth0.com",
      E2E_AUTH0_CLIENT_ID: "test-client-id",
      E2E_AUTH0_AUDIENCE: "https://api.example.com",
      E2E_AUTH_EMAIL: "test@example.com",
    };

    expect(() => validateAuth0Config(env)).toThrow("E2E_AUTH_PASSWORD");
  });

  it("throws with guidance about ROPC grant requirements when any var is missing", () => {
    expect(() => validateAuth0Config({})).toThrow("Password grant type enabled");
  });
});

describe("fetchAuth0TokensWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns tokens on first successful attempt", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(VALID_TOKEN_RESPONSE),
    });

    const promise = fetchAuth0TokensWithRetry(VALID_CONFIG, mockFetch);
    await vi.runAllTimersAsync();
    const tokens = await promise;

    expect(tokens).toEqual(VALID_TOKEN_RESPONSE);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on transient failure and succeeds on second attempt", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Too Many Requests"),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_TOKEN_RESPONSE),
      });

    const promise = fetchAuth0TokensWithRetry(VALID_CONFIG, mockFetch);
    await vi.runAllTimersAsync();
    const tokens = await promise;

    expect(tokens).toEqual(VALID_TOKEN_RESPONSE);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on transient failure and succeeds on third attempt", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve("Service Unavailable"),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Too Many Requests"),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_TOKEN_RESPONSE),
      });

    const promise = fetchAuth0TokensWithRetry(VALID_CONFIG, mockFetch);
    await vi.runAllTimersAsync();
    const tokens = await promise;

    expect(tokens).toEqual(VALID_TOKEN_RESPONSE);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all 3 attempts", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Too Many Requests"),
    });

    let caughtError: Error | undefined;
    const promise = fetchAuth0TokensWithRetry(VALID_CONFIG, mockFetch).catch((err: Error) => {
      caughtError = err;
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(caughtError?.message).toContain("Auth0 token request failed");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("uses exponential backoff between retries", async () => {
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Too Many Requests"),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Too Many Requests"),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_TOKEN_RESPONSE),
      });

    // Spy on setTimeout to capture delays
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((fn: TimerHandler, delay?: number) => {
        if (typeof delay === "number") {
          delays.push(delay);
        }
        return realSetTimeout(fn as () => void, 0);
      });

    const promise = fetchAuth0TokensWithRetry(VALID_CONFIG, mockFetch);
    await vi.runAllTimersAsync();
    await promise;

    setTimeoutSpy.mockRestore();

    // First retry delay should be ~1000ms, second ~2000ms (exponential backoff)
    expect(delays.length).toBe(2);
    expect(delays[0]).toBeGreaterThanOrEqual(1000);
    expect(delays[1]).toBeGreaterThan(delays[0]!);
  });

  it("includes attempt number in error message after all retries exhausted", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    let caughtError: Error | undefined;
    const promise = fetchAuth0TokensWithRetry(VALID_CONFIG, mockFetch).catch((err: Error) => {
      caughtError = err;
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(caughtError?.message).toContain("3");
  });
});
