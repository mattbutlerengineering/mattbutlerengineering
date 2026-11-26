import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Read from disk (not `?raw`, which false-passes). #9819: opacity 0.6 on
// #1a1918 over #f8f6f3 is 4.49:1, under AA. Use the secondary text token.
const RULES: Record<string, string[]> = {
  "AiHealthPage.module.css": ["meta", "statLabel"],
  "MetricsPage.module.css": [
    "meta",
    "levelRole",
    "gateValue",
    "statLabel",
    "changeMeta",
    "emptyState",
  ],
  "StatusPage.module.css": ["lastChecked", "meta", "signalNote"],
};

function ruleBody(css: string, selector: string): string {
  const match = css.match(new RegExp(`(?:^|\\n)\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`rule .${selector} not found`);
  return match[1] ?? "";
}

describe("marketing meta text contrast (#9819)", () => {
  for (const [file, selectors] of Object.entries(RULES)) {
    const css = readFileSync(resolve(__dirname, file), "utf8");
    for (const selector of selectors) {
      it(`${file} .${selector} uses the secondary text token, not opacity`, () => {
        const body = ruleBody(css, selector);
        expect(body).not.toMatch(/opacity\s*:\s*0?\.\d+/);
        expect(body).toContain("color: var(--rialto-text-secondary)");
      });
    }
  }
});
