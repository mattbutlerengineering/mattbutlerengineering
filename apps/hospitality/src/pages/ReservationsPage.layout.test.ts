import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// CSS modules are not applied in jsdom, so the touch floor is pinned on the source rule.
const CSS = readFileSync(resolve(process.cwd(), "src/pages/ReservationsPage.module.css"), "utf-8");
const TSX = readFileSync(resolve(process.cwd(), "src/pages/ReservationsPage.tsx"), "utf-8");

describe("ReservationsPage toolbar on phone and tablet", () => {
  it("gives the New reservation button a 44px touch floor at phone/tablet widths", () => {
    const block = CSS.match(
      /@media \(pointer: coarse\), \(max-width: 1024px\) \{\s*\.newReservation \{([^}]*)\}/
    );
    expect(block?.[1]).toMatch(/min-block-size:\s*44px/);
  });

  it("applies that rule to the toolbar's New reservation button", () => {
    expect(TSX).toMatch(/size="sm"\s+className=\{styles\.newReservation\}/);
  });
});
