import { describe, it, expect } from "vitest";
import { countRialtoTokens } from "./rialto-tokens.js";

describe("countRialtoTokens", () => {
  it("counts unique --rialto-* custom property declarations", () => {
    const css = ":root{--rialto-color-a:#fff;--rialto-color-b:#000;--rialto-space-sm:8px}";
    expect(countRialtoTokens(css)).toBe(3);
  });

  it("dedupes tokens redeclared across theme blocks", () => {
    const css = `:root{--rialto-accent:#c9a227}
[data-theme="dark"]{--rialto-accent:#e0b84a}`;
    expect(countRialtoTokens(css)).toBe(1);
  });

  it("ignores var() usages and non-rialto custom properties", () => {
    const css = ":root{--rialto-accent:#c9a227;--other-x:red;color:var(--rialto-accent)}";
    expect(countRialtoTokens(css)).toBe(1);
  });

  it("returns 0 when no tokens are present", () => {
    expect(countRialtoTokens(".foo{color:red}")).toBe(0);
  });
});
