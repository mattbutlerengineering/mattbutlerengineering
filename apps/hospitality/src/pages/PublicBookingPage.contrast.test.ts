import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// CSS modules are not applied in jsdom, so assert on the source rule: the
// not-found link sits on an accent fill and must use the contrast-checked
// on-accent text token (light 5.15:1, dark 7.55:1), not the page surface
// token (light 3.16:1, below WCAG AA 4.5:1).
const css = readFileSync(resolve(process.cwd(), "src/pages/PublicBookingPage.module.css"), "utf8");

function ruleBody(selector: string): string {
  const match = css.match(new RegExp(`^\\${selector}\\s*\\{([^}]*)\\}`, "m"));
  if (!match) throw new Error(`rule ${selector} not found`);
  return match[1] ?? "";
}

describe("PublicBookingPage not-found link contrast", () => {
  it("uses the on-accent text token over the accent fill", () => {
    const body = ruleBody(".notFoundLink");
    expect(body).toContain("background: var(--rialto-accent)");
    expect(body).toContain("color: var(--rialto-text-on-accent)");
    expect(body).not.toContain("color: var(--rialto-surface)");
  });
});

// #10118: the header must share the booking card's left edge. The card is
// capped at 28rem (BookingWidget.module.css); a wider header column starts
// left of it.
describe("PublicBookingPage header alignment", () => {
  it("caps the header at the booking card's 28rem width", () => {
    const widget = readFileSync(
      resolve(process.cwd(), "src/components/booking-widget/BookingWidget.module.css"),
      "utf8"
    );
    expect(widget).toMatch(/max-inline-size:\s*28rem/);
    expect(ruleBody(".header")).toContain("max-inline-size: 28rem");
  });
});
