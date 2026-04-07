import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to mock Conf as a class constructor
const store = new Map<string, unknown>();

vi.mock("conf", () => {
  return {
    default: class MockConf {
      get(key: string) {
        return store.get(key);
      }
      set(key: string, value: unknown) {
        store.set(key, value);
      }
      delete(key: string) {
        store.delete(key);
      }
    },
  };
});

import type { getApiUrl, getAccessToken, setTokens, clearTokens, isAuthenticated } from "../config.js";

interface ConfigModule {
  getApiUrl: typeof getApiUrl;
  getAccessToken: typeof getAccessToken;
  setTokens: typeof setTokens;
  clearTokens: typeof clearTokens;
  isAuthenticated: typeof isAuthenticated;
}

describe("config module", () => {
  let configModule: ConfigModule;

  beforeEach(async () => {
    store.clear();
    vi.resetModules();
    configModule = await import("../config.js");
  });

  describe("getApiUrl", () => {
    it("returns default URL when not configured", () => {
      expect(configModule.getApiUrl()).toBe("http://localhost:3001");
    });

    it("returns configured URL when set", () => {
      store.set("apiUrl", "https://api.example.com");
      expect(configModule.getApiUrl()).toBe("https://api.example.com");
    });
  });

  describe("getAccessToken", () => {
    it("returns undefined when no token is set", () => {
      expect(configModule.getAccessToken()).toBeUndefined();
    });

    it("returns token when valid and not expired", () => {
      store.set("accessToken", "test-token");
      store.set("tokenExpiry", Date.now() + 60_000);
      expect(configModule.getAccessToken()).toBe("test-token");
    });

    it("returns undefined and clears expired token", () => {
      store.set("accessToken", "expired-token");
      store.set("tokenExpiry", Date.now() - 1000);
      const result = configModule.getAccessToken();
      expect(result).toBeUndefined();
      expect(store.has("accessToken")).toBe(false);
    });
  });

  describe("setTokens", () => {
    it("stores access token and computes expiry", () => {
      const before = Date.now();
      configModule.setTokens("new-token", 3600);
      expect(store.get("accessToken")).toBe("new-token");
      const expiry = store.get("tokenExpiry") as number;
      expect(expiry).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(expiry).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
    });
  });

  describe("clearTokens", () => {
    it("removes all token-related keys", () => {
      store.set("accessToken", "token");
      store.set("refreshToken", "refresh");
      store.set("tokenExpiry", 12345);
      configModule.clearTokens();
      expect(store.has("accessToken")).toBe(false);
      expect(store.has("refreshToken")).toBe(false);
      expect(store.has("tokenExpiry")).toBe(false);
    });
  });

  describe("isAuthenticated", () => {
    it("returns false when no token", () => {
      expect(configModule.isAuthenticated()).toBe(false);
    });

    it("returns true when valid token exists", () => {
      store.set("accessToken", "valid");
      store.set("tokenExpiry", Date.now() + 60_000);
      expect(configModule.isAuthenticated()).toBe(true);
    });
  });
});
