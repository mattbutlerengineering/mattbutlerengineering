import { describe, it, expect } from "vitest";
import { findProductionThrowSecretNames } from "../lib/production-throw-scan.mjs";

// Probes A–E reproduced from #4067's rework spec: the detector must resolve
// the guarded secret's name by walking the AST to a `process.env.<NAME>`
// read, not by scraping UPPER_SNAKE_CASE tokens out of the thrown message.
describe("findProductionThrowSecretNames — structural secret-name resolution", () => {
  it("A — detects a secret literally named in the message (baseline, already worked)", () => {
    const source = `
      const isProduction = process.env.NODE_ENV === "production";
      const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
      if (isProduction) {
        if (!secret) {
          throw new Error("UNSUBSCRIBE_TOKEN_SECRET is required in production");
        }
      }
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(
      new Set(["UNSUBSCRIBE_TOKEN_SECRET"])
    );
  });

  it("B — resolves the secret via process.env even when the message omits the name", () => {
    const source = `
      const isProduction = process.env.NODE_ENV === "production";
      const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
      if (isProduction) {
        if (!secret) {
          throw new Error("Missing required secret for unsubscribe links");
        }
      }
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(
      new Set(["UNSUBSCRIBE_TOKEN_SECRET"])
    );
  });

  it("C — recognizes a function-call production guard (isProduction())", () => {
    const source = `
      const secret = process.env.MY_TOKEN_SECRET;
      if (isProduction()) {
        if (!secret) {
          throw new Error("MY_TOKEN_SECRET is required");
        }
      }
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(
      new Set(["MY_TOKEN_SECRET"])
    );
  });

  it("D — recognizes an inequality guard against a non-production env string", () => {
    const source = `
      const secret = process.env.MY_TOKEN_SECRET;
      if (process.env.NODE_ENV !== "development") {
        if (!secret) {
          throw new Error("MY_TOKEN_SECRET is required");
        }
      }
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(
      new Set(["MY_TOKEN_SECRET"])
    );
  });

  it("E — recognizes an early-return guard clause ahead of the throw", () => {
    const source = `
      const secret = process.env.MY_TOKEN_SECRET;
      function check() {
        if (!isProduction) return;
        if (!secret) {
          throw new Error("MY_TOKEN_SECRET is required");
        }
      }
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(
      new Set(["MY_TOKEN_SECRET"])
    );
  });

  it("does not flag a throw gated only by an unrelated, non-production condition", () => {
    const source = `
      const secret = process.env.MY_TOKEN_SECRET;
      if (someUnrelatedFeatureFlag) {
        if (!secret) {
          throw new Error("MY_TOKEN_SECRET is required when the flag is on");
        }
      }
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(new Set());
  });

  it("still detects a fully unconditional (bare) throw — strictly more dangerous than a guarded one", () => {
    // Fail-closed: an unguarded throw fires in every environment, including
    // production, so it must still be reported. Structural resolution finds
    // nothing here (no process.env reference), so this exercises the
    // message-token fallback explicitly kept for this case.
    const source = `
      throw new Error("FOO_TOKEN_SECRET is required in production. Set this env var.");
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(
      new Set(["FOO_TOKEN_SECRET"])
    );
  });

  it("throws loudly on unparseable input instead of silently returning an empty set", () => {
    const malformed = ")))";
    expect(() => findProductionThrowSecretNames(malformed, "probe.ts")).toThrow();
  });
});
