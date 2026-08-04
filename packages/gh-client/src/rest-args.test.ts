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
  it("prefers GITHUB_TOKEN", () => {
    expect(resolveToken({ GITHUB_TOKEN: "a", GH_TOKEN: "b" })).toBe("a");
  });

  it("falls back to GH_TOKEN", () => {
    expect(resolveToken({ GH_TOKEN: "b" })).toBe("b");
  });

  it("throws MissingGithubTokenError naming the missing credential when neither is set", () => {
    expect(() => resolveToken({})).toThrow(MissingGithubTokenError);
    expect(() => resolveToken({})).toThrow(/GITHUB_TOKEN/);
    expect(() => resolveToken({})).toThrow(/GH_TOKEN/);
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
