import { describe, expect, it } from "vitest";
import { applyRules, isProseFile, type Rule } from "./rule-engine.js";

const rule: Rule = { pattern: /danger/, category: "malicious-command", severity: "high" };

describe("applyRules", () => {
  it("reports the 1-indexed line of each match", () => {
    const findings = applyRules("a.js", "safe\ndanger here\nsafe", [rule]);
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(2);
    expect(findings[0].evidence).toBe("danger here");
  });

  it("returns an empty array when nothing matches", () => {
    expect(applyRules("a.js", "all good", [rule])).toEqual([]);
  });

  it("truncates long evidence", () => {
    const long = `danger ${"x".repeat(300)}`;
    const findings = applyRules("a.js", long, [rule]);
    expect(findings[0].evidence.length).toBeLessThanOrEqual(120);
  });
});

describe("isProseFile", () => {
  it("recognises markdown and text", () => {
    expect(isProseFile("a/SKILL.md")).toBe(true);
    expect(isProseFile("notes.txt")).toBe(true);
    expect(isProseFile("doc.mdx")).toBe(true);
  });
  it("rejects code files", () => {
    expect(isProseFile("index.js")).toBe(false);
    expect(isProseFile("a.ts")).toBe(false);
  });
});
