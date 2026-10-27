/**
 * Motion policy: a hover rule never moves the element (#7830).
 *
 * A `:hover { transform: translateY(-1px) }` on a button shifts its box by 1px;
 * a pointer parked on its bottom edge then leaves the hit area, un-hovers, the
 * box drops back, and the pointer is over it again -- a flicker that never
 * settles. Playwright reads that as "element is not stable" and every click on
 * the button times out. The framer `whileHover` boop used to override the CSS
 * transform inline, hiding the rule until #7819 removed it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cssPath = resolve(__dirname, "../../components/Button/Button.module.css");

function hoverRulesWithTransform(css: string): string[] {
  const rules = css.match(/[^{}]+\{[^{}]*\}/g) ?? [];
  return rules
    .filter((rule) => /:hover/.test(rule.split("{")[0] ?? ""))
    .filter((rule) => /(^|[\s;{])transform\s*:/.test(rule.split("{")[1] ?? ""))
    .map((rule) => (rule.split("{")[0] ?? "").trim());
}

describe("Button hover: colour and shadow only, no transform", () => {
  it("declares no transform on any :hover rule", () => {
    expect(hoverRulesWithTransform(readFileSync(cssPath, "utf8"))).toEqual([]);
  });
});
