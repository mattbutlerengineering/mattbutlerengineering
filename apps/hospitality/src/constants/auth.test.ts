import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("validateAuthConfig", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_AUTH_AUTHORITY", "https://auth.example.com");
    vi.stubEnv("VITE_AUTH_CLIENT_ID", "test-client-id");
    vi.stubEnv("VITE_AUTH_REDIRECT_URI", "");
    vi.stubEnv("VITE_AUTH_AUDIENCE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadValidateAuthConfig() {
    const mod = await import("./auth.js");
    return mod.validateAuthConfig;
  }

  it("returns valid config when all required env vars are set", async () => {
    const validateAuthConfig = await loadValidateAuthConfig();
    const result = validateAuthConfig();

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.authority).toBe("https://auth.example.com");
      expect(result.config.clientId).toBe("test-client-id");
    }
  });

  it("returns missing VITE_AUTH_AUTHORITY when not set", async () => {
    vi.stubEnv("VITE_AUTH_AUTHORITY", "");
    const validateAuthConfig = await loadValidateAuthConfig();
    const result = validateAuthConfig();

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missing).toContain("VITE_AUTH_AUTHORITY");
    }
  });

  it("returns missing VITE_AUTH_CLIENT_ID when not set", async () => {
    vi.stubEnv("VITE_AUTH_CLIENT_ID", "");
    const validateAuthConfig = await loadValidateAuthConfig();
    const result = validateAuthConfig();

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missing).toContain("VITE_AUTH_CLIENT_ID");
    }
  });

  it("returns both missing when neither is set", async () => {
    vi.stubEnv("VITE_AUTH_AUTHORITY", "");
    vi.stubEnv("VITE_AUTH_CLIENT_ID", "");
    const validateAuthConfig = await loadValidateAuthConfig();
    const result = validateAuthConfig();

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missing).toContain("VITE_AUTH_AUTHORITY");
      expect(result.missing).toContain("VITE_AUTH_CLIENT_ID");
      expect(result.missing.length).toBe(2);
    }
  });

  it("treats whitespace-only values as missing", async () => {
    vi.stubEnv("VITE_AUTH_AUTHORITY", "   ");
    vi.stubEnv("VITE_AUTH_CLIENT_ID", "  ");
    const validateAuthConfig = await loadValidateAuthConfig();
    const result = validateAuthConfig();

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missing.length).toBe(2);
    }
  });

  it("uses fallback redirectUri when VITE_AUTH_REDIRECT_URI is not set", async () => {
    const validateAuthConfig = await loadValidateAuthConfig();
    const result = validateAuthConfig();

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.redirectUri).toBe("http://localhost:3000/hospitality/callback");
    }
  });

  it("uses provided redirectUri when VITE_AUTH_REDIRECT_URI is set", async () => {
    vi.stubEnv("VITE_AUTH_REDIRECT_URI", "https://example.com/callback");
    const validateAuthConfig = await loadValidateAuthConfig();
    const result = validateAuthConfig();

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.redirectUri).toBe("https://example.com/callback");
    }
  });

  it("returns undefined audience when VITE_AUTH_AUDIENCE is not set", async () => {
    const validateAuthConfig = await loadValidateAuthConfig();
    const result = validateAuthConfig();

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.audience).toBeUndefined();
    }
  });

  it("returns audience when VITE_AUTH_AUDIENCE is set", async () => {
    vi.stubEnv("VITE_AUTH_AUDIENCE", "https://api.example.com");
    const validateAuthConfig = await loadValidateAuthConfig();
    const result = validateAuthConfig();

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.audience).toBe("https://api.example.com");
    }
  });
});
