import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "showcase.module.css"),
  "utf-8"
);

describe("showcase reveal rules", () => {
  // CSS modules hash class names but leave attribute selectors global. A bare
  // `[data-reveal] > *` would hide the children of any element that carries
  // the attribute, such as the invite card on InvitePage.
  it("apply only inside the landing", () => {
    const revealSelectors = css
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /\[data-reveal(ed)?[\]=]/.test(line) && /[,{]$/.test(line));

    expect(revealSelectors.length).toBeGreaterThan(0);
    expect(revealSelectors.filter((line) => !line.startsWith(":where(.night) "))).toEqual([]);
  });
});
