import { describe, it, expect } from "vitest";
import {
  getWeeklyStrategy,
  shouldRunDiscovery,
  findPerfImprovements,
  findA11yImprovements,
  findDesignInconsistencies,
  findTestGaps,
  deduplicateAgainstOpen,
  rankAndCap,
} from "../improvement-discoverer.mjs";

describe("getWeeklyStrategy", () => {
  it("returns perf for week 0 mod 4", () => {
    expect(getWeeklyStrategy(0)).toBe("perf");
    expect(getWeeklyStrategy(4)).toBe("perf");
    expect(getWeeklyStrategy(8)).toBe("perf");
  });

  it("returns a11y for week 1 mod 4", () => {
    expect(getWeeklyStrategy(1)).toBe("a11y");
    expect(getWeeklyStrategy(5)).toBe("a11y");
  });

  it("returns design for week 2 mod 4", () => {
    expect(getWeeklyStrategy(2)).toBe("design");
    expect(getWeeklyStrategy(6)).toBe("design");
  });

  it("returns test-gaps for week 3 mod 4", () => {
    expect(getWeeklyStrategy(3)).toBe("test-gaps");
    expect(getWeeklyStrategy(7)).toBe("test-gaps");
  });
});

describe("shouldRunDiscovery", () => {
  it("returns false when regressions exist", () => {
    expect(shouldRunDiscovery({ regressions: 2, acmmGaps: 0, securityIssues: 0 })).toBe(false);
  });

  it("returns false when ACMM gaps exist", () => {
    expect(shouldRunDiscovery({ regressions: 0, acmmGaps: 3, securityIssues: 0 })).toBe(false);
  });

  it("returns false when security issues exist", () => {
    expect(shouldRunDiscovery({ regressions: 0, acmmGaps: 0, securityIssues: 1 })).toBe(false);
  });

  it("returns true when queue is clear", () => {
    expect(shouldRunDiscovery({ regressions: 0, acmmGaps: 0, securityIssues: 0 })).toBe(true);
  });
});

describe("findPerfImprovements", () => {
  it("identifies pages with perf score < 90", () => {
    const inventory = [
      { url: "/", scores: { performance: 0.95 } },
      { url: "/about", scores: { performance: 0.82 } },
      { url: "/contact", scores: { performance: 0.75 } },
    ];
    const result = findPerfImprovements(inventory);
    expect(result.length).toBe(2);
    expect(result[0].url).toBe("/contact");
    expect(result[1].url).toBe("/about");
  });

  it("returns empty for all-good scores", () => {
    const inventory = [{ url: "/", scores: { performance: 0.95 } }];
    expect(findPerfImprovements(inventory)).toEqual([]);
  });

  it("handles missing scores gracefully", () => {
    const inventory = [{ url: "/", scores: {} }];
    expect(findPerfImprovements(inventory)).toEqual([]);
  });
});

describe("findA11yImprovements", () => {
  it("identifies pages with a11y score < 95", () => {
    const inventory = [
      { url: "/", scores: { accessibility: 0.98 } },
      { url: "/about", scores: { accessibility: 0.85 } },
    ];
    const result = findA11yImprovements(inventory);
    expect(result.length).toBe(1);
    expect(result[0].url).toBe("/about");
  });
});

describe("findDesignInconsistencies", () => {
  it("detects hardcoded hex colors", () => {
    const files = [
      { path: "src/App.tsx", content: 'color: "#ff0000"' },
      { path: "src/Good.tsx", content: "color: var(--rialto-primary)" },
    ];
    const result = findDesignInconsistencies(files);
    expect(result.length).toBe(1);
    expect(result[0].path).toBe("src/App.tsx");
  });

  it("detects hardcoded px values", () => {
    const files = [{ path: "src/Layout.tsx", content: "padding: 16px" }];
    const result = findDesignInconsistencies(files);
    expect(result.length).toBe(1);
  });

  it("returns empty for clean files", () => {
    const files = [{ path: "src/Clean.tsx", content: "import { Box } from 'rialto'" }];
    expect(findDesignInconsistencies(files)).toEqual([]);
  });
});

describe("findTestGaps", () => {
  it("identifies surfaces without test coverage", () => {
    const surfaces = ["/", "/about", "/contact"];
    const testFiles = ["home.test.ts", "about.test.ts"];
    const result = findTestGaps(surfaces, testFiles);
    expect(result.length).toBe(1);
    expect(result[0]).toBe("/contact");
  });

  it("returns empty when all surfaces covered", () => {
    const surfaces = ["/", "/about"];
    const testFiles = ["home.test.ts", "about.test.ts"];
    expect(findTestGaps(surfaces, testFiles)).toEqual([]);
  });
});

describe("deduplicateAgainstOpen", () => {
  it("removes improvements matching open issues", () => {
    const improvements = [
      { title: "perf: /about page score 82", url: "/about" },
      { title: "perf: /contact page score 75", url: "/contact" },
    ];
    const openIssues = [{ title: "fix(audit): /about performance regressed" }];
    const result = deduplicateAgainstOpen(improvements, openIssues);
    expect(result.length).toBe(1);
    expect(result[0].url).toBe("/contact");
  });

  it("keeps all when no overlap", () => {
    const improvements = [{ title: "perf: / page score 88", url: "/" }];
    const result = deduplicateAgainstOpen(improvements, []);
    expect(result.length).toBe(1);
  });
});

describe("rankAndCap", () => {
  it("caps at 2 issues", () => {
    const items = [
      { title: "a", score: 0.5 },
      { title: "b", score: 0.6 },
      { title: "c", score: 0.7 },
    ];
    const result = rankAndCap(items);
    expect(result.length).toBe(2);
  });

  it("ranks by score ascending (worst first)", () => {
    const items = [
      { title: "good", score: 0.88 },
      { title: "bad", score: 0.65 },
    ];
    const result = rankAndCap(items);
    expect(result[0].title).toBe("bad");
  });

  it("returns empty for empty input", () => {
    expect(rankAndCap([])).toEqual([]);
  });
});
