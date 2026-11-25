/**
 * At 375px the bar's nowrap row was clipped by the page ("About" as "Al")
 * and a dropdown anchored to a trigger near the right edge ran past the viewport.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("NavigationMenu narrow column", () => {
  const css = readFileSync(path.join(__dirname, "NavigationMenu.module.css"), "utf8");
  const source = readFileSync(path.join(__dirname, "NavigationMenu.tsx"), "utf8");

  it("wraps the bar inside the column instead of clipping trailing labels", () => {
    const nav = /\.nav\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(nav).toMatch(/flex-wrap:\s*wrap/);
    expect(nav).toMatch(/min-inline-size:\s*0/);
    expect(nav).toMatch(/max-inline-size:\s*100%/);
  });

  it("shifts an open panel that would leave the viewport", () => {
    expect(source).toMatch(/useShiftIntoViewport\(isOpen,\s*panelRef\)/);
  });
});
