import { describe, it, expect, afterEach, vi } from "vitest";

// We must import this lazily because the module reads env vars at import time
// and we need to set env vars before the module loads.
async function importStripeConfig() {
  // Clear module cache so env changes take effect
  const mod = await import("./stripe.js");
  return mod;
}

describe("getStripeConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env after each test
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  describe("in production (NODE_ENV=production)", () => {
    // Missing Stripe secrets must NOT crash the service at boot. Deposits are an
    // optional feature and every use-point already fails closed: the webhook
    // route rejects unsigned/unverifiable events (empty secret → 400) and the
    // payment-intent path falls back to a placeholder key (Stripe calls fail).
    // So the service boots with deposits disabled and warns loudly instead.

    it("warns but does not throw when STRIPE_SECRET_KEY is absent", async () => {
      const { getStripeConfig } = await importStripeConfig();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const config = getStripeConfig({
        nodeEnv: "production",
        secretKey: undefined,
        webhookSecret: undefined,
      });

      expect(config.secretKey).toBe("");
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/STRIPE_SECRET_KEY/));
      warn.mockRestore();
    });

    it("warns but does not throw when STRIPE_WEBHOOK_SECRET is absent", async () => {
      const { getStripeConfig } = await importStripeConfig();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const config = getStripeConfig({
        nodeEnv: "production",
        secretKey: "sk_live_something",
        webhookSecret: undefined,
      });

      expect(config.webhookSecret).toBe("");
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/STRIPE_WEBHOOK_SECRET/));
      warn.mockRestore();
    });

    it("warns but does not throw when STRIPE_SECRET_KEY is empty string", async () => {
      const { getStripeConfig } = await importStripeConfig();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const config = getStripeConfig({
        nodeEnv: "production",
        secretKey: "",
        webhookSecret: "whsec_something",
      });

      expect(config.secretKey).toBe("");
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/STRIPE_SECRET_KEY/));
      warn.mockRestore();
    });

    it("warns but does not throw when STRIPE_WEBHOOK_SECRET is empty string", async () => {
      const { getStripeConfig } = await importStripeConfig();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const config = getStripeConfig({
        nodeEnv: "production",
        secretKey: "sk_live_something",
        webhookSecret: "",
      });

      expect(config.webhookSecret).toBe("");
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/STRIPE_WEBHOOK_SECRET/));
      warn.mockRestore();
    });

    it("does not warn and returns config when both keys are present", async () => {
      const { getStripeConfig } = await importStripeConfig();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const config = getStripeConfig({
        nodeEnv: "production",
        secretKey: "sk_live_something",
        webhookSecret: "whsec_something",
      });

      expect(config.secretKey).toBe("sk_live_something");
      expect(config.webhookSecret).toBe("whsec_something");
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe("in non-production (NODE_ENV=development)", () => {
    it("allows absent STRIPE_SECRET_KEY with a warning", async () => {
      const { getStripeConfig } = await importStripeConfig();

      const config = getStripeConfig({
        nodeEnv: "development",
        secretKey: undefined,
        webhookSecret: undefined,
      });

      expect(config.secretKey).toBe("");
      expect(config.webhookSecret).toBe("");
    });

    it("allows empty STRIPE_SECRET_KEY with a warning", async () => {
      const { getStripeConfig } = await importStripeConfig();

      const config = getStripeConfig({
        nodeEnv: "development",
        secretKey: "",
        webhookSecret: "",
      });

      expect(config.secretKey).toBe("");
      expect(config.webhookSecret).toBe("");
    });

    it("returns provided values when set", async () => {
      const { getStripeConfig } = await importStripeConfig();

      const config = getStripeConfig({
        nodeEnv: "development",
        secretKey: "sk_test_local",
        webhookSecret: "whsec_local",
      });

      expect(config.secretKey).toBe("sk_test_local");
      expect(config.webhookSecret).toBe("whsec_local");
    });
  });

  describe("in test environment (NODE_ENV=test)", () => {
    it("allows absent secrets without throwing", async () => {
      const { getStripeConfig } = await importStripeConfig();

      const config = getStripeConfig({
        nodeEnv: "test",
        secretKey: undefined,
        webhookSecret: undefined,
      });

      expect(config.secretKey).toBe("");
      expect(config.webhookSecret).toBe("");
    });
  });
});
