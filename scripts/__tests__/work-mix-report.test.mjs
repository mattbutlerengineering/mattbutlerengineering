import { describe, expect, it } from "vitest";
import {
  classifyTitle,
  countIssueLabels,
  openTrackingAges,
  parseArgs,
  searchCapWarning,
  summarizeWorkMix,
} from "../work-mix-report.mjs";

describe("classifyTitle", () => {
  it("reads the Conventional Commits type, with or without a scope", () => {
    expect(classifyTitle("feat(hospitality): public invite page (#8698)")).toBe("feat");
    expect(classifyTitle("chore: version packages (#8677)")).toBe("chore");
    expect(classifyTitle("revert: #8701 (fixes broken main) (#8713)")).toBe("revert");
  });

  it("puts a title with no recognised type under other", () => {
    expect(classifyTitle("Bump vite from 6 to 7")).toBe("other");
    expect(classifyTitle("party(time): not a real type")).toBe("other");
  });
});

describe("summarizeWorkMix", () => {
  it("counts each type and its whole-number share of the total", () => {
    const prs = [
      { title: "feat: a" },
      { title: "chore: b" },
      { title: "chore(metrics): c" },
      { title: "fix(x): d" },
    ];
    expect(summarizeWorkMix(prs)).toEqual({
      total: 4,
      byType: [
        { type: "chore", count: 2, sharePct: 50 },
        { type: "feat", count: 1, sharePct: 25 },
        { type: "fix", count: 1, sharePct: 25 },
      ],
    });
  });

  it("returns an empty mix for no PRs instead of dividing by zero", () => {
    expect(summarizeWorkMix([])).toEqual({ total: 0, byType: [] });
  });
});

describe("countIssueLabels", () => {
  it("counts only the watched labels, most frequent first", () => {
    const issues = [
      { labels: [{ name: "feature" }, { name: "area:hospitality" }] },
      { labels: [{ name: "ci-fix" }] },
      { labels: [{ name: "ci-fix" }, { name: "bug" }] },
    ];
    expect(countIssueLabels(issues, ["feature", "ci-fix", "bug", "audit"])).toEqual([
      { label: "ci-fix", count: 2 },
      { label: "bug", count: 1 },
      { label: "feature", count: 1 },
      { label: "audit", count: 0 },
    ]);
  });
});

describe("openTrackingAges", () => {
  it("lists open issues by age in days, oldest first", () => {
    const now = Date.parse("2026-11-11T00:00:00Z");
    const issues = [
      { number: 1, title: "young", createdAt: "2026-11-10T00:00:00Z" },
      { number: 2, title: "old", createdAt: "2026-10-18T12:00:00Z" },
    ];
    expect(openTrackingAges(issues, now)).toEqual([
      { number: 2, title: "old", ageDays: 23.5 },
      { number: 1, title: "young", ageDays: 1 },
    ]);
  });
});

describe("parseArgs", () => {
  it("accepts a real date and a positive limit", () => {
    expect(parseArgs(["--since", "2026-10-28", "--json"])).toEqual({
      since: "2026-10-28",
      limit: 100,
      json: true,
    });
  });

  it("rejects a flag with no value instead of falling back silently", () => {
    expect(() => parseArgs(["--since"])).toThrow(/--since needs a value/);
    expect(() => parseArgs(["--limit"])).toThrow(/--limit needs a value/);
  });

  it("rejects a date that matches the pattern but does not exist", () => {
    expect(() => parseArgs(["--since", "2026-13-45"])).toThrow(/not a real date/);
    expect(() => parseArgs(["--since", "2026-02-30"])).toThrow(/not a real date/);
  });
});

describe("searchCapWarning", () => {
  it("warns when a search returned GitHub's 1000-result maximum", () => {
    expect(searchCapWarning("merged PRs", 1000)).toMatch(/1000.*merged PRs.*incomplete/);
  });

  it("says nothing below the cap", () => {
    expect(searchCapWarning("merged PRs", 999)).toBeNull();
  });
});
