import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The overlay ladder. A Dialog asked from a Drawer (a confirm over a dirty form) is rendered
 * beside it, not inside it, so the two share one stacking context and only the numbers decide
 * which one a click reaches. jsdom ignores these stylesheets, so the values are read from source.
 */
const COMPONENTS = path.join(__dirname, "..");

function zIndex(component: string, selector: string): number {
  const css = fs.readFileSync(path.join(COMPONENTS, component, `${component}.module.css`), "utf-8");
  const match = new RegExp(`\\.${selector}\\s*\\{[^}]*?z-index:\\s*(\\d+)`, "s").exec(css);
  if (!match?.[1]) throw new Error(`no z-index on .${selector} in ${component}`);
  return Number(match[1]);
}

describe("overlay layering", () => {
  const dialog = zIndex("Dialog", "overlay");

  it("stacks a Dialog above a Drawer's overlay and panel, so its buttons are reachable", () => {
    expect(dialog).toBeGreaterThan(zIndex("Drawer", "overlay"));
    expect(dialog).toBeGreaterThan(zIndex("Drawer", "panel"));
  });

  it("opens the command palette above a Dialog: its shortcut works while one is open", () => {
    expect(zIndex("CommandPalette", "overlay")).toBeGreaterThan(dialog);
  });

  it("keeps a Select menu above a Dialog and the palette, and a Toast above all of them", () => {
    const palette = zIndex("CommandPalette", "overlay");
    expect(zIndex("Select", "dropdown")).toBeGreaterThan(palette);
    expect(zIndex("Toast", "container")).toBeGreaterThan(zIndex("Select", "dropdown"));
  });
});
