/**
 * Outside a dialog the menu is positioned by CSS against its trigger.
 * align="right" on a trigger near the left of a 375px page painted the menu
 * from x=-29. The same viewport shift the navigation panel uses pulls it back.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DropdownMenu viewport shift", () => {
  const source = readFileSync(path.join(__dirname, "DropdownMenu.tsx"), "utf8");

  it("shifts a menu that is not inside a dialog", () => {
    expect(source).toMatch(/useShiftIntoViewport\(open && dialogLayer === null, menuRef\)/);
  });
});
