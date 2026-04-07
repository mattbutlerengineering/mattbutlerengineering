import { describe, it, expect } from "vitest";
import { analyzeDiff, formatViolations, ANALYSIS_RULES } from "../diff-static-analyzer.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeDiff(file: string, addedLines: string[], hunkStart = 1): string {
  const header = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,0 +${hunkStart},${addedLines.length} @@`;
  const lines = addedLines.map((l) => `+${l}`).join("\n");
  return `${header}\n${lines}`;
}

// ── analyzeDiff ──────────────────────────────────────────────────────

describe("analyzeDiff", () => {
  it("returns clean result for empty diff", () => {
    const result = analyzeDiff("");
    expect(result.clean).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns clean result for whitespace-only diff", () => {
    const result = analyzeDiff("   \n\t  ");
    expect(result.clean).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("detects console.log in .ts file", () => {
    const diff = makeDiff("src/utils.ts", ['console.log("debug");']);
    const result = analyzeDiff(diff);

    expect(result.clean).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe("no-console-log");
    expect(result.violations[0].file).toBe("src/utils.ts");
    expect(result.violations[0].severity).toBe("error");
  });

  it("detects console.log in .tsx file", () => {
    const diff = makeDiff("src/App.tsx", ['console.log("render");']);
    const result = analyzeDiff(diff);

    expect(result.violations.some((v) => v.rule === "no-console-log")).toBe(true);
  });

  it("detects hardcoded hex in .tsx file", () => {
    const diff = makeDiff("src/Card.tsx", ['const color = "#ff0000";']);
    const result = analyzeDiff(diff);

    expect(result.violations.some((v) => v.rule === "no-hardcoded-hex")).toBe(true);
    expect(result.violations.find((v) => v.rule === "no-hardcoded-hex")!.severity).toBe("warning");
  });

  it("does NOT flag hardcoded hex in .css file", () => {
    const diff = makeDiff("src/tokens.css", ["  --color-primary: #3b82f6;"]);
    const result = analyzeDiff(diff);

    expect(result.violations.some((v) => v.rule === "no-hardcoded-hex")).toBe(false);
  });

  it("does NOT flag hardcoded hex in .ts file (only tsx/jsx)", () => {
    const diff = makeDiff("src/constants.ts", ['const HEX = "#abc123";']);
    const result = analyzeDiff(diff);

    expect(result.violations.some((v) => v.rule === "no-hardcoded-hex")).toBe(false);
  });

  it("detects img without alt attribute", () => {
    const diff = makeDiff("src/Hero.tsx", ['<img src="logo.png" />']);
    const result = analyzeDiff(diff);

    expect(result.violations.some((v) => v.rule === "img-missing-alt")).toBe(true);
    expect(result.violations.find((v) => v.rule === "img-missing-alt")!.severity).toBe("error");
  });

  it("does NOT flag img with alt attribute", () => {
    const diff = makeDiff("src/Hero.tsx", ['<img src="logo.png" alt="Company logo" />']);
    const result = analyzeDiff(diff);

    expect(result.violations.some((v) => v.rule === "img-missing-alt")).toBe(false);
  });

  it("detects inline styles in .tsx file", () => {
    const diff = makeDiff("src/Box.tsx", ["<div style={{ color: 'red' }}>"]);
    const result = analyzeDiff(diff);

    expect(result.violations.some((v) => v.rule === "no-inline-style")).toBe(true);
    expect(result.violations.find((v) => v.rule === "no-inline-style")!.severity).toBe("warning");
  });

  it("detects TODO comments", () => {
    const diff = makeDiff("src/api.ts", ["// TODO: handle error case"]);
    const result = analyzeDiff(diff);

    expect(result.violations.some((v) => v.rule === "no-todo-fixme")).toBe(true);
  });

  it("detects FIXME comments", () => {
    const diff = makeDiff("src/api.ts", ["// FIXME: race condition"]);
    const result = analyzeDiff(diff);

    expect(result.violations.some((v) => v.rule === "no-todo-fixme")).toBe(true);
  });

  it("reports multiple violations in one diff", () => {
    const diff = makeDiff("src/Page.tsx", [
      'console.log("debug");',
      'const bg = "#fff";',
      '<img src="hero.png" />',
      "<div style={{ margin: 10 }}>",
      "// TODO: refactor this",
    ]);
    const result = analyzeDiff(diff);

    expect(result.clean).toBe(false);
    const ruleIds = result.violations.map((v) => v.rule);
    expect(ruleIds).toContain("no-console-log");
    expect(ruleIds).toContain("no-hardcoded-hex");
    expect(ruleIds).toContain("img-missing-alt");
    expect(ruleIds).toContain("no-inline-style");
    expect(ruleIds).toContain("no-todo-fixme");
  });

  it("returns clean=true for a diff with no violations", () => {
    const diff = makeDiff("src/utils.ts", [
      'import { logger } from "./logger.js";',
      "export function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
    ]);
    const result = analyzeDiff(diff);

    expect(result.clean).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("measures duration (durationMs >= 0)", () => {
    const diff = makeDiff("src/app.ts", ["const x = 1;"]);
    const result = analyzeDiff(diff);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe("number");
  });

  it("tracks line numbers correctly from hunk headers", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -10,3 +10,5 @@",
      " const x = 1;",
      '+console.log("at line 11");',
      " const y = 2;",
      '+console.log("at line 13");',
    ].join("\n");

    const result = analyzeDiff(diff);

    expect(result.violations).toHaveLength(2);
    expect(result.violations[0].line).toBe(11);
    expect(result.violations[1].line).toBe(13);
  });

  it("handles multiple files in one diff", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,0 +1,1 @@",
      '+console.log("a");',
      "diff --git a/src/b.tsx b/src/b.tsx",
      "--- a/src/b.tsx",
      "+++ b/src/b.tsx",
      "@@ -5,0 +5,1 @@",
      '+const c = "#abc";',
    ].join("\n");

    const result = analyzeDiff(diff);

    const consoleViolation = result.violations.find((v) => v.rule === "no-console-log");
    const hexViolation = result.violations.find((v) => v.rule === "no-hardcoded-hex");

    expect(consoleViolation?.file).toBe("src/a.ts");
    expect(hexViolation?.file).toBe("src/b.tsx");
    expect(hexViolation?.line).toBe(5);
  });

  it("ignores removed lines (starting with -)", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,1 +1,1 @@",
      '-console.log("old");',
      "+const x = 1;",
    ].join("\n");

    const result = analyzeDiff(diff);

    expect(result.clean).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ── ANALYSIS_RULES ──────────────────────────────────────────────────

describe("new rules", () => {
  it("detects any type annotation", () => {
    const diff = makeDiff("src/utils.ts", ["const data: any = fetch();"]);
    const result = analyzeDiff(diff);
    expect(result.violations.some((v) => v.rule === "no-any-type")).toBe(true);
  });

  it("detects Object.assign mutation", () => {
    const diff = makeDiff("src/utils.ts", ["Object.assign(target, source);"]);
    const result = analyzeDiff(diff);
    expect(result.violations.some((v) => v.rule === "no-object-mutation")).toBe(true);
  });

  it("detects array.push mutation", () => {
    const diff = makeDiff("src/utils.ts", ["items.push(newItem);"]);
    const result = analyzeDiff(diff);
    expect(result.violations.some((v) => v.rule === "no-object-mutation")).toBe(true);
  });

  it("detects hardcoded localhost URL", () => {
    const diff = makeDiff("src/api.ts", ['const url = "http://localhost:3000/api";']);
    const result = analyzeDiff(diff);
    expect(result.violations.some((v) => v.rule === "no-hardcoded-url")).toBe(true);
  });

  it("detects empty catch block", () => {
    const diff = makeDiff("src/utils.ts", ["} catch (e) {}"]);
    const result = analyzeDiff(diff);
    expect(result.violations.some((v) => v.rule === "no-empty-catch")).toBe(true);
  });

  it("does not flag catch with body", () => {
    const diff = makeDiff("src/utils.ts", ['} catch (e) { logger.error(e); }']);
    const result = analyzeDiff(diff);
    expect(result.violations.some((v) => v.rule === "no-empty-catch")).toBe(false);
  });
});

describe("ANALYSIS_RULES", () => {
  it("has 10 rules defined", () => {
    expect(ANALYSIS_RULES).toHaveLength(10);
  });

  it("each rule has required fields", () => {
    for (const rule of ANALYSIS_RULES) {
      expect(rule.id).toBeTruthy();
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.message).toBeTruthy();
      expect(["warning", "error"]).toContain(rule.severity);
    }
  });
});

// ── formatViolations ────────────────────────────────────────────────

describe("formatViolations", () => {
  it("returns 'No violations found.' for empty array", () => {
    expect(formatViolations([])).toBe("No violations found.");
  });

  it("formats a single error violation", () => {
    const output = formatViolations([
      {
        rule: "no-console-log",
        file: "src/app.ts",
        line: 5,
        message: "Remove console.log()",
        severity: "error",
      },
    ]);

    expect(output).toContain("ERROR");
    expect(output).toContain("src/app.ts:5");
    expect(output).toContain("[no-console-log]");
    expect(output).toContain("1 error(s), 0 warning(s)");
  });

  it("formats mixed error and warning violations", () => {
    const output = formatViolations([
      {
        rule: "no-console-log",
        file: "src/app.ts",
        line: 5,
        message: "Remove console.log()",
        severity: "error",
      },
      {
        rule: "no-todo-fixme",
        file: "src/utils.ts",
        line: 10,
        message: "Resolve TODO",
        severity: "warning",
      },
    ]);

    expect(output).toContain("2 violation(s) found");
    expect(output).toContain("1 error(s), 1 warning(s)");
    expect(output).toContain("ERROR");
    expect(output).toContain("WARN");
  });
});
