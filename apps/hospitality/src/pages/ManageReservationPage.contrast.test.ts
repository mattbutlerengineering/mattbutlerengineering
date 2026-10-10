import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// CSS modules are not applied in jsdom, so assert on the source rule: the
// home link sits on an accent fill and must use the contrast-checked
// on-accent text token (light 5.15:1, dark 7.55:1), not the page surface
// token (light 3.16:1, below WCAG AA 4.5:1).
const css = readFileSync(
  resolve(process.cwd(), "src/pages/ManageReservationPage.module.css"),
  "utf8"
);

function ruleBody(selector: string): string {
  const match = css.match(new RegExp(`^\\${selector}\\s*\\{([^}]*)\\}`, "m"));
  if (!match) throw new Error(`rule ${selector} not found`);
  return match[1] ?? "";
}

describe("ManageReservationPage home link contrast", () => {
  it("uses the on-accent text token over the accent fill", () => {
    const body = ruleBody(".homeLink");
    expect(body).toContain("background: var(--rialto-accent)");
    expect(body).toContain("color: var(--rialto-text-on-accent)");
    expect(body).not.toContain("color: var(--rialto-surface)");
  });
});
