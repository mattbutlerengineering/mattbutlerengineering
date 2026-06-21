import { describe, it, expect } from "vitest";
import { getManageTokenConfig } from "./manage-token.js";

describe("getManageTokenConfig", () => {
  describe("in production (NODE_ENV=production)", () => {
    it("throws when MANAGE_TOKEN_SECRET is absent", () => {
      expect(() => getManageTokenConfig({ nodeEnv: "production", secret: undefined })).toThrow(
        /MANAGE_TOKEN_SECRET/
      );
    });

    it("throws when MANAGE_TOKEN_SECRET is empty string", () => {
      expect(() => getManageTokenConfig({ nodeEnv: "production", secret: "" })).toThrow(
        /MANAGE_TOKEN_SECRET/
      );
    });

    it("returns the secret when present", () => {
      const config = getManageTokenConfig({
        nodeEnv: "production",
        secret: "a-real-prod-secret",
      });
      expect(config.secret).toBe("a-real-prod-secret");
    });
  });

  describe("in non-production (NODE_ENV=development)", () => {
    it("allows absent secret with a warning (does not throw)", () => {
      const config = getManageTokenConfig({ nodeEnv: "development", secret: undefined });
      expect(config.secret).toBe("");
    });

    it("allows empty secret with a warning (does not throw)", () => {
      const config = getManageTokenConfig({ nodeEnv: "development", secret: "" });
      expect(config.secret).toBe("");
    });

    it("returns the provided secret when set", () => {
      const config = getManageTokenConfig({ nodeEnv: "development", secret: "dev-secret" });
      expect(config.secret).toBe("dev-secret");
    });
  });

  describe("in test environment (NODE_ENV=test)", () => {
    it("allows absent secret without throwing", () => {
      const config = getManageTokenConfig({ nodeEnv: "test", secret: undefined });
      expect(config.secret).toBe("");
    });
  });
});
