import { describe, test, expect } from "vitest";

describe("pulumi-r2-validation-guard", () => {
  describe("productionStateBucket", () => {
    test("parses the bucket name out of pulumi-up.yml's s3:// cloud-url", async () => {
      const { productionStateBucket } = await import("../pulumi-r2-validation-guard.mjs");

      const workflowYaml = [
        '  cloud-url: "s3://mattbutlerengineering-pulumi-state?endpoint=https://example.r2.cloudflarestorage.com&s3ForcePathStyle=true"',
      ].join("\n");

      expect(productionStateBucket(workflowYaml)).toBe("mattbutlerengineering-pulumi-state");
    });

    test("throws when no s3:// url is present, rather than returning a guess", async () => {
      const { productionStateBucket } = await import("../pulumi-r2-validation-guard.mjs");

      expect(() => productionStateBucket("no backend url here")).toThrow();
    });
  });

  describe("resolveScratchBucket", () => {
    test("prefers the workflow input over the fallback secret", async () => {
      const { resolveScratchBucket } = await import("../pulumi-r2-validation-guard.mjs");

      expect(
        resolveScratchBucket({
          inputBucket: "scratch-from-input",
          secretBucket: "scratch-from-secret",
        })
      ).toBe("scratch-from-input");
    });

    test("falls back to the secret when no input is given", async () => {
      const { resolveScratchBucket } = await import("../pulumi-r2-validation-guard.mjs");

      expect(resolveScratchBucket({ inputBucket: "", secretBucket: "scratch-from-secret" })).toBe(
        "scratch-from-secret"
      );
    });

    test("throws when neither input nor secret resolve to a non-blank bucket", async () => {
      const { resolveScratchBucket } = await import("../pulumi-r2-validation-guard.mjs");

      expect(() => resolveScratchBucket({ inputBucket: "", secretBucket: "" })).toThrow();
      expect(() => resolveScratchBucket({ inputBucket: "   ", secretBucket: undefined })).toThrow();
      expect(() => resolveScratchBucket({})).toThrow();
    });
  });

  describe("assertScratchBucketSafe — the most important check in this file", () => {
    const PROD = "mattbutlerengineering-pulumi-state";

    test("accepts a genuine scratch bucket", async () => {
      const { assertScratchBucketSafe } = await import("../pulumi-r2-validation-guard.mjs");

      expect(() => assertScratchBucketSafe("mbe-pulumi-scratch-validation", PROD)).not.toThrow();
    });

    test("rejects the production bucket outright", async () => {
      const { assertScratchBucketSafe } = await import("../pulumi-r2-validation-guard.mjs");

      expect(() => assertScratchBucketSafe(PROD, PROD)).toThrow(/production/i);
    });

    test("rejects a blank or missing bucket rather than silently falling back", async () => {
      const { assertScratchBucketSafe } = await import("../pulumi-r2-validation-guard.mjs");

      expect(() => assertScratchBucketSafe("", PROD)).toThrow();
      expect(() => assertScratchBucketSafe(undefined, PROD)).toThrow();
      expect(() => assertScratchBucketSafe("   ", PROD)).toThrow();
    });

    test("rejects case- and whitespace-variants of the prod bucket name", async () => {
      const { assertScratchBucketSafe } = await import("../pulumi-r2-validation-guard.mjs");

      expect(() => assertScratchBucketSafe(PROD.toUpperCase(), PROD)).toThrow(/production/i);
      expect(() => assertScratchBucketSafe(`  ${PROD}  `, PROD)).toThrow(/production/i);
      expect(() =>
        assertScratchBucketSafe(PROD.replace(/-/g, "-").toUpperCase() + " ", PROD)
      ).toThrow(/production/i);
    });
  });

  describe("meetsMinimumPulumiVersion", () => {
    test("accepts a version equal to the minimum", async () => {
      const { meetsMinimumPulumiVersion } = await import("../pulumi-r2-validation-guard.mjs");

      expect(meetsMinimumPulumiVersion("3.256.0", "3.256.0")).toBe(true);
    });

    test("accepts a version above the minimum", async () => {
      const { meetsMinimumPulumiVersion } = await import("../pulumi-r2-validation-guard.mjs");

      expect(meetsMinimumPulumiVersion("3.257.1", "3.256.0")).toBe(true);
    });

    test("rejects a version below the minimum", async () => {
      const { meetsMinimumPulumiVersion } = await import("../pulumi-r2-validation-guard.mjs");

      expect(meetsMinimumPulumiVersion("3.253.0", "3.256.0")).toBe(false);
    });

    test("compares numerically, not lexicographically (3.9.0 < 3.10.0)", async () => {
      const { meetsMinimumPulumiVersion } = await import("../pulumi-r2-validation-guard.mjs");

      expect(meetsMinimumPulumiVersion("3.10.0", "3.9.0")).toBe(true);
    });

    test("throws on an unparseable version instead of silently passing", async () => {
      const { meetsMinimumPulumiVersion } = await import("../pulumi-r2-validation-guard.mjs");

      expect(() => meetsMinimumPulumiVersion("latest", "3.256.0")).toThrow();
      expect(() => meetsMinimumPulumiVersion("", "3.256.0")).toThrow();
    });
  });
});
