import { describe, it, expect } from "vitest";
import { ENGINEERING_PAGES, isEngineeringPageCurrent } from "./engineering-menu";

describe("engineering menu", () => {
  it("lists the six pages in the owner's order", () => {
    expect(ENGINEERING_PAGES.map((p) => p.label)).toEqual([
      "Metrics",
      "Shipped",
      "Weekly",
      "Status",
      "AI health",
      "ACMM",
    ]);
  });

  it("matches the page and its children, not a prefix sibling", () => {
    expect(isEngineeringPageCurrent("/shipped", "/shipped")).toBe(true);
    expect(isEngineeringPageCurrent("/shipped/some-story", "/shipped")).toBe(true);
    expect(isEngineeringPageCurrent("/metrics-old", "/metrics")).toBe(false);
    expect(isEngineeringPageCurrent("/", "/metrics")).toBe(false);
  });
});
