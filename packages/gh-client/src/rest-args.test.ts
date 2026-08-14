import { describe, it, expect } from "vitest";
import {
  MissingGithubTokenError,
  resolveToken,
  parseArgs,
  flag,
  flagAll,
  wantsJsonField,
} from "./rest-args.js";

describe("resolveToken", () => {
  it("prefers GITHUB_TOKEN over every other var", () => {
    expect(
      resolveToken({
        GITHUB_TOKEN: "a",
        GH_TOKEN: "b",
        GITHUB_PERSONAL_ACCESS_TOKEN: "c",
        AUTOMATION_PAT: "d",
      })
    ).toBe("a");
  });

  it("falls back to GH_TOKEN", () => {
    expect(resolveToken({ GH_TOKEN: "b" })).toBe("b");
  });

  it("GH_TOKEN wins over GITHUB_PERSONAL_ACCESS_TOKEN and AUTOMATION_PAT", () => {
    expect(
      resolveToken({ GH_TOKEN: "b", GITHUB_PERSONAL_ACCESS_TOKEN: "c", AUTOMATION_PAT: "d" })
    ).toBe("b");
  });

  it("falls back to GITHUB_PERSONAL_ACCESS_TOKEN when GITHUB_TOKEN and GH_TOKEN are unset", () => {
    expect(resolveToken({ GITHUB_PERSONAL_ACCESS_TOKEN: "c" })).toBe("c");
  });

  it("GITHUB_PERSONAL_ACCESS_TOKEN wins over AUTOMATION_PAT", () => {
    expect(resolveToken({ GITHUB_PERSONAL_ACCESS_TOKEN: "c", AUTOMATION_PAT: "d" })).toBe("c");
  });

  it("falls back to AUTOMATION_PAT when none of the other three are set", () => {
    expect(resolveToken({ AUTOMATION_PAT: "d" })).toBe("d");
  });

  it("throws MissingGithubTokenError naming the missing credentials when none are set", () => {
    expect(() => resolveToken({})).toThrow(MissingGithubTokenError);
    expect(() => resolveToken({})).toThrow(/GITHUB_TOKEN/);
    expect(() => resolveToken({})).toThrow(/GH_TOKEN/);
  });
});

describe("resolveToken precedence", () => {
  // Regression matrix for #4192 (part 2/3 of the gh-client REST-fallback
  // 401 fix). Each source is asserted alone (so dropping a var from the
  // `??` chain fails a test) and at least twice in combination (so
  // swapping two vars' order fails a test even when the "alone" cases
  // can't tell the swap apart).

  it("resolves from GITHUB_TOKEN alone", () => {
    expect(resolveToken({ GITHUB_TOKEN: "a" })).toBe("a");
  });

  it("resolves from GH_TOKEN alone", () => {
    expect(resolveToken({ GH_TOKEN: "b" })).toBe("b");
  });

  it("resolves from GITHUB_PERSONAL_ACCESS_TOKEN alone", () => {
    expect(resolveToken({ GITHUB_PERSONAL_ACCESS_TOKEN: "c" })).toBe("c");
  });

  it("resolves from AUTOMATION_PAT alone", () => {
    expect(resolveToken({ AUTOMATION_PAT: "d" })).toBe("d");
  });

  it("precedence: GITHUB_TOKEN beats GH_TOKEN, GITHUB_PERSONAL_ACCESS_TOKEN, and AUTOMATION_PAT when all four are set", () => {
    expect(
      resolveToken({
        GITHUB_TOKEN: "a",
        GH_TOKEN: "b",
        GITHUB_PERSONAL_ACCESS_TOKEN: "c",
        AUTOMATION_PAT: "d",
      })
    ).toBe("a");
  });

  it("precedence: GH_TOKEN beats GITHUB_PERSONAL_ACCESS_TOKEN and AUTOMATION_PAT when GITHUB_TOKEN is unset", () => {
    expect(
      resolveToken({ GH_TOKEN: "b", GITHUB_PERSONAL_ACCESS_TOKEN: "c", AUTOMATION_PAT: "d" })
    ).toBe("b");
  });

  it("precedence: GITHUB_PERSONAL_ACCESS_TOKEN beats AUTOMATION_PAT when GITHUB_TOKEN and GH_TOKEN are unset", () => {
    expect(resolveToken({ GITHUB_PERSONAL_ACCESS_TOKEN: "c", AUTOMATION_PAT: "d" })).toBe("c");
  });

  // Empirically verified against the current implementation (`??`-based
  // chain, see rest-args.ts): `??` only falls through on null/undefined,
  // NOT on empty string. `"" ?? "b"` evaluates to `""`, so an empty-string
  // higher-precedence var does NOT fall through to the next source — the
  // chain resolves to `""`, and `if (!token) throw` then throws because
  // `""` is falsy. This is the opposite of what issue #4192's acceptance
  // criteria assumed ("falls through, matching existing `??` semantics");
  // `??` semantics are exactly why it does NOT fall through. These tests
  // pin the REAL, current behavior per #4192's explicit instruction not to
  // change resolveToken's semantics in this test-only PR. Making
  // empty-string values fall through (e.g. via `||` instead of `??`, or an
  // explicit `=== ""` check) would be a deliberate semantic change and
  // belongs in its own follow-up issue, not silently bundled here.
  it("an empty-string GITHUB_TOKEN does NOT fall through to GH_TOKEN — throws instead", () => {
    expect(() => resolveToken({ GITHUB_TOKEN: "", GH_TOKEN: "b" })).toThrow(
      MissingGithubTokenError
    );
  });

  it("an empty-string GH_TOKEN does NOT fall through to GITHUB_PERSONAL_ACCESS_TOKEN — throws instead", () => {
    expect(() => resolveToken({ GH_TOKEN: "", GITHUB_PERSONAL_ACCESS_TOKEN: "c" })).toThrow(
      MissingGithubTokenError
    );
  });
});

describe("parseArgs", () => {
  it("splits positionals from flags", () => {
    const parsed = parseArgs(["issue", "list", "--state", "open", "--limit", "10"]);
    expect(parsed.positional).toEqual(["issue", "list"]);
    expect(parsed.flags).toEqual({ state: ["open"], limit: ["10"] });
  });

  it("collects repeated flags", () => {
    const parsed = parseArgs(["--add-label", "a", "--add-label", "b"]);
    expect(parsed.flags["add-label"]).toEqual(["a", "b"]);
  });
});

describe("flag / flagAll / wantsJsonField", () => {
  it("flag returns the first value", () => {
    const parsed = parseArgs(["--state", "open"]);
    expect(flag(parsed, "state")).toBe("open");
    expect(flag(parsed, "missing")).toBeUndefined();
  });

  it("flagAll flattens repeated and comma-separated values", () => {
    const parsed = parseArgs(["--label", "a,b", "--label", "c"]);
    expect(flagAll(parsed, "label")).toEqual(["a", "b", "c"]);
  });

  it("wantsJsonField checks the --json field list", () => {
    const parsed = parseArgs(["--json", "number,title,labels"]);
    expect(wantsJsonField(parsed, "labels")).toBe(true);
    expect(wantsJsonField(parsed, "commits")).toBe(false);
  });
});
