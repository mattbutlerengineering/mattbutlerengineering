import { describe, it, expect } from "vitest";
import type { WeeklyResource } from "./weekly-intake.js";
import { latestPublishedAt, recentReadingItems } from "./weekly-freshness.js";

const resource = (id: string, publishedAt: string): WeeklyResource => ({
  id,
  title: `Title ${id}`,
  url: `https://example.com/${id}`,
  source: "other",
  description: "d",
  publishedAt,
  tags: ["t"],
});

const NOW = new Date("2026-10-27T00:00:00Z");

describe("recentReadingItems", () => {
  it("returns nothing when every item is older than the window", () => {
    expect(recentReadingItems([resource("a", "2026-04-29")], NOW)).toEqual([]);
  });

  it("keeps items inside the window, newest first, capped at three", () => {
    const items = [
      resource("old", "2026-04-29"),
      resource("a", "2026-10-01"),
      resource("b", "2026-10-20"),
      resource("c", "2026-10-10"),
      resource("d", "2026-10-15"),
    ];
    expect(recentReadingItems(items, NOW).map((r) => r.id)).toEqual(["b", "d", "c"]);
  });
});

describe("latestPublishedAt", () => {
  it("returns the newest publish date", () => {
    expect(latestPublishedAt([resource("a", "2026-04-01"), resource("b", "2026-04-29")])).toBe(
      "2026-04-29"
    );
  });

  it("returns null for no items", () => {
    expect(latestPublishedAt([])).toBeNull();
  });
});
