import { describe, it, expect } from "vitest";
import { getUnsubscribeTokenConfig } from "./unsubscribe-token.js";

describe("getUnsubscribeTokenConfig", () => {
  describe("in production (NODE_ENV=production)", () => {
    it("throws when UNSUBSCRIBE_TOKEN_SECRET is absent", () => {
      expect(() => getUnsubscribeTokenConfig({ nodeEnv: "production", secret: undefined })).toThrow(
        /UNSUBSCRIBE_TOKEN_SECRET/
      );
    });

    it("throws when UNSUBSCRIBE_TOKEN_SECRET is empty string", () => {
      expect(() => getUnsubscribeTokenConfig({ nodeEnv: "production", secret: "" })).toThrow(
        /UNSUBSCRIBE_TOKEN_SECRET/
      );
    });

    it("returns the secret when present", () => {
      const config = getUnsubscribeTokenConfig({
        nodeEnv: "production",
        secret: "a-real-prod-secret",
      });
      expect(config.secret).toBe("a-real-prod-secret");
    });
  });

  describe("in non-production (NODE_ENV=development)", () => {
    it("allows absent secret with a warning (does not throw)", () => {
      const config = getUnsubscribeTokenConfig({ nodeEnv: "development", secret: undefined });
      expect(config.secret).toBe("");
    });

    it("allows empty secret with a warning (does not throw)", () => {
      const config = getUnsubscribeTokenConfig({ nodeEnv: "development", secret: "" });
      expect(config.secret).toBe("");
    });

    it("returns the provided secret when set", () => {
      const config = getUnsubscribeTokenConfig({ nodeEnv: "development", secret: "dev-secret" });
      expect(config.secret).toBe("dev-secret");
    });
  });

  describe("in test environment (NODE_ENV=test)", () => {
    it("allows absent secret without throwing", () => {
      const config = getUnsubscribeTokenConfig({ nodeEnv: "test", secret: undefined });
      expect(config.secret).toBe("");
    });
  });
});
