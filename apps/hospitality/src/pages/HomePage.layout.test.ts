import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// CSS modules are not applied in jsdom, so the touch target is pinned on the source rules (#10038).
const CSS = readFileSync(resolve(process.cwd(), "src/pages/HomePage.module.css"), "utf-8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);
const TOUCH_QUERY = "@media (pointer: coarse), (max-width: 1024px)";

function mediaBody(query: string): string {
  const start = CSS.indexOf(`${query} {`);
  if (start === -1) return "";
  let depth = 0;
  for (let i = CSS.indexOf("{", start); i < CSS.length; i += 1) {
    if (CSS[i] === "{") depth += 1;
    if (CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) return CSS.slice(CSS.indexOf("{", start) + 1, i);
    }
  }
  return "";
}

describe("HomePage quick actions touch targets (#10038)", () => {
  it("reach 44px on touch screens and phone/tablet widths", () => {
    const touch = mediaBody(TOUCH_QUERY);
    expect(touch).toMatch(/\.actionsRow > button\s*\{[^}]*min-block-size:\s*44px/);
    expect(touch).toMatch(/\.actionsRow > button\s*\{[^}]*min-inline-size:\s*44px/);
  });

  it("keep their compact size on desktop", () => {
    const outsideMedia = CSS.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    expect(outsideMedia).not.toMatch(/\.actionsRow > button/);
  });
});
