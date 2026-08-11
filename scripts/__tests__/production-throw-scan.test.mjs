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

// #4085: `isProductionGuardExpr` didn't descend into `&&` operands, so the
// idiomatic one-line collapse of the nested guard shape — the exact shape
// both real call sites (manage-token.ts, unsubscribe-token.ts) use — was
// silently dropped (fail-open: an unprovisioned secret produced no finding).
describe("findProductionThrowSecretNames — compound && guard (#4085)", () => {
  it("compound_AND — resolves the secret from `if (isProduction && !secret) throw`", () => {
    const source = `
      if (process.env.NODE_ENV === "production" && !process.env.MANAGE_TOKEN_SECRET) {
        throw new Error("MANAGE_TOKEN_SECRET must be set in production");
      }
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(
      new Set(["MANAGE_TOKEN_SECRET"])
    );
  });

  it("and_reversed — operand order does not matter", () => {
    const source = `
      if (!process.env.MANAGE_TOKEN_SECRET && process.env.NODE_ENV === "production") {
        throw new Error("MANAGE_TOKEN_SECRET must be set");
      }
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(
      new Set(["MANAGE_TOKEN_SECRET"])
    );
  });

  it("nesting depth does not matter — `a && (isProduction && !x)`", () => {
    const source = `
      const secret = process.env.MY_TOKEN_SECRET;
      if (someOtherFlag && (isProduction && !secret)) {
        throw new Error("MY_TOKEN_SECRET is required");
      }
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(
      new Set(["MY_TOKEN_SECRET"])
    );
  });

  it("simple_guard — nested-if form still works (no regression)", () => {
    const source = `
      if (process.env.NODE_ENV === "production") {
        if (!process.env.MANAGE_TOKEN_SECRET) {
          throw new Error("MANAGE_TOKEN_SECRET must be set in production");
        }
      }
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(
      new Set(["MANAGE_TOKEN_SECRET"])
    );
  });
});

// #4085: `||` is deliberately NOT treated the same as `&&`. `A && B` being
// true proves both operands were true, so a production-check operand
// establishes production is a *necessary* condition for reachability. `A ||
// B` being true proves nothing about either individual operand — the whole
// expression can be true purely via the unrelated operand, with the
// production-check operand false. Recognizing `isProduction || flag` as a
// production guard would misclassify a throw that can fire for reasons that
// have nothing to do with production as "production-reachable" on
// structurally unsound grounds. We choose to fail conservatively (miss a
// throw gated this way) over asserting a guard relationship the AST doesn't
// actually prove. See scripts/lib/production-throw-scan.mjs for the same
// reasoning pinned at the implementation site.
describe("findProductionThrowSecretNames — compound || guard is NOT recognized (#4085, deliberate)", () => {
  it("an `||` operand alone does not establish production-reachability (documented miss)", () => {
    const source = `
      const secret = process.env.MY_TOKEN_SECRET;
      if (isProduction || someUnrelatedFeatureFlag) {
        if (!secret) {
          throw new Error("MY_TOKEN_SECRET is required");
        }
      }
    `;
    expect(findProductionThrowSecretNames(source, "probe.ts")).toEqual(new Set());
  });
});
