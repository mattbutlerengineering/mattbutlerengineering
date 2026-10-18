import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// CSS modules are not applied in jsdom, so assert on the source rule (see
// PublicBookingPage.contrast.test.ts): an accent fill needs the on-accent text token.
const css = readFileSync(resolve(process.cwd(), "src/pages/PublicMenu.module.css"), "utf8");

describe("public menu pages contrast", () => {
  it("never pairs an accent fill with the surface text token", () => {
    const rules = css.match(/[^{}]+\{[^}]*\}/g) ?? [];
    const accentFills = rules.filter((r) => /background:\s*var\(--rialto-accent\)/.test(r));
    for (const rule of accentFills) {
      expect(rule).toContain("color: var(--rialto-text-on-accent)");
    }
  });
});
