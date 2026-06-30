import { describe, it, expect, vi } from "vitest";
import { validatePreflightEnv, runAuthPreflight } from "../e2e-auth-preflight.mjs";

const FULL_ENV = {
  E2E_AUTH0_DOMAIN: "dev-test.us.auth0.com",
  E2E_AUTH0_CLIENT_ID: "client123",
  E2E_AUTH0_AUDIENCE: "https://api.example.com",
  E2E_AUTH_EMAIL: "test@example.com",
  E2E_AUTH_PASSWORD: "password123",
};

describe("validatePreflightEnv", () => {
  it("returns ok:false listing all missing vars when env is empty", () => {
    const result = validatePreflightEnv({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/E2E_AUTH0_DOMAIN/);
      expect(result.reason).toMatch(/E2E_AUTH0_CLIENT_ID/);
      expect(result.reason).toMatch(/E2E_AUTH0_AUDIENCE/);
      expect(result.reason).toMatch(/E2E_AUTH_EMAIL/);
      expect(result.reason).toMatch(/E2E_AUTH_PASSWORD/);
    }
  });

  it("returns ok:false listing only the missing vars when partial env provided", () => {
    const result = validatePreflightEnv({ E2E_AUTH0_DOMAIN: "dev.auth0.com" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toMatch(/E2E_AUTH0_DOMAIN/);
      expect(result.reason).toMatch(/E2E_AUTH0_CLIENT_ID/);
    }
  });

  it("returns ok:true when all required vars are present", () => {
    const result = validatePreflightEnv(FULL_ENV);
    expect(result.ok).toBe(true);
  });
});

describe("runAuthPreflight", () => {
  it("returns ok:false with missing-env reason when env is empty", async () => {
    const result = await runAuthPreflight({}, vi.fn());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/missing env vars/i);
    }
  });

  it("returns ok:true when Auth0 returns 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: "tok_secret",
          id_token: "id_secret",
          token_type: "Bearer",
          expires_in: 86400,
        }),
    });

    const result = await runAuthPreflight(FULL_ENV, mockFetch);
    expect(result.ok).toBe(true);
  });

  it("does not include token values in the result on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: "tok_secret_value",
          id_token: "id_secret_value",
          token_type: "Bearer",
          expires_in: 86400,
        }),
    });

    const result = await runAuthPreflight(FULL_ENV, mockFetch);
    // On success, result has no reason field — just verify ok:true and no secret leakage
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("tok_secret_value");
    expect(JSON.stringify(result)).not.toContain("id_secret_value");
  });

  it("returns ok:false with auth-rejected reason when Auth0 returns 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          error: "access_denied",
          error_description: "Wrong email or password.",
        }),
    });

    const result = await runAuthPreflight(FULL_ENV, mockFetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/auth rejected/i);
      expect(result.reason).toMatch(/401/);
      expect(result.reason).toMatch(/access_denied/);
    }
  });

  it("returns ok:false with auth-rejected reason when Auth0 returns 403", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          error: "unauthorized_client",
          error_description: "Grant type password not allowed for the client.",
        }),
    });

    const result = await runAuthPreflight(FULL_ENV, mockFetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/auth rejected/i);
      expect(result.reason).toMatch(/403/);
      expect(result.reason).toMatch(/unauthorized_client/);
    }
  });

  it("returns ok:false with network-error reason when fetch throws", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await runAuthPreflight(FULL_ENV, mockFetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/network error/i);
      expect(result.reason).toMatch(/ECONNREFUSED/);
    }
  });

  it("does not include credential values in the reason on auth rejection", async () => {
    const sensitiveEnv = {
      E2E_AUTH0_DOMAIN: "dev.auth0.com",
      E2E_AUTH0_CLIENT_ID: "super-secret-client-id",
      E2E_AUTH0_AUDIENCE: "https://api.example.com",
      E2E_AUTH_EMAIL: "user@example.com",
      E2E_AUTH_PASSWORD: "super-secret-password-xyz",
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({ error: "access_denied", error_description: "Wrong email or password." }),
    });

    const result = await runAuthPreflight(sensitiveEnv, mockFetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toContain("super-secret-client-id");
      expect(result.reason).not.toContain("super-secret-password-xyz");
    }
  });
});
