import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A shell can raise the band's block-start padding to clear fixed chrome.
 * Unset, the padding stays the design scale (xl, and lg below 640px).
 */
describe("PageHeader shell clearance", () => {
  const css = readFileSync(path.join(__dirname, "PageHeader.module.css"), "utf8");

  it("takes an optional block-start override without shrinking the design padding", () => {
    const compact = css.replace(/\s+/g, "");
    expect(compact).toContain(
      "max(var(--rialto-space-xl),var(--rialto-page-header-padding-block-start,0px))"
    );
    expect(compact).toContain(
      "max(var(--rialto-space-lg),var(--rialto-page-header-padding-block-start,0px))"
    );
  });
});
