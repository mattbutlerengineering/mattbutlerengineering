import { describe, it, expect } from "vitest";
import { SITE_STATS } from "./stats.js";
import { PROJECTS } from "./projects.js";
import { TECH_STACK } from "./tech-stack.js";

describe("SITE_STATS", () => {
  it("exposes a non-empty strip of social-proof metrics", () => {
    expect(SITE_STATS.length).toBeGreaterThan(0);
  });

  it("each metric has a positive numeric value and a visible label", () => {
    for (const stat of SITE_STATS) {
      expect(typeof stat.value).toBe("number");
      expect(Number.isFinite(stat.value)).toBe(true);
      expect(stat.value).toBeGreaterThan(0);
      expect(stat.label).toBeTruthy();
    }
  });

  it("derives figures from existing site content — no fabricated claims", () => {
    const byLabel = (needle: string) =>
      SITE_STATS.find((stat) => stat.label.toLowerCase().includes(needle));

    // Projects shipped mirrors the featured PROJECTS list exactly.
    expect(byLabel("projects")?.value).toBe(PROJECTS.length);

    // "Domains owned" mirrors the number of tech-stack categories.
    expect(byLabel("domains")?.value).toBe(TECH_STACK.length);

    // "Technologies" mirrors the total count of tech-stack items.
    const techTotal = TECH_STACK.reduce((sum, category) => sum + category.items.length, 0);
    expect(byLabel("technologies")?.value).toBe(techTotal);
  });

  it("only uses a trailing suffix to signal an at-least figure", () => {
    for (const stat of SITE_STATS) {
      if (stat.suffix !== undefined) {
        expect(stat.suffix).toBe("+");
      }
    }
  });
});
