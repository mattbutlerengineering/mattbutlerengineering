/**
 * Horizontal steps share the row with flex-basis 0. At 375px each column is
 * narrower than "Scrutineering", and the label painted into the next step.
 * Labels have to stay inside their own column.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Steps label collision", () => {
  const css = readFileSync(path.join(__dirname, "Steps.module.css"), "utf8");

  it("scrolls the horizontal row at narrow widths so long labels stay intact", () => {
    const narrow = css.slice(css.indexOf("@media (max-width: 640px)"));
    expect(narrow).toMatch(/\.horizontal\s*\{[^}]*overflow-x:\s*auto/);
    expect(narrow).toMatch(/\.horizontal\s*\{[^}]*min-width:\s*0/);
    expect(narrow).toMatch(/\.horizontal \.step\s*\{[^}]*min-width:\s*max-content/);
    expect(narrow).toMatch(/\.horizontal \.stepLabel\s*\{[^}]*white-space:\s*nowrap/);
  });
});
