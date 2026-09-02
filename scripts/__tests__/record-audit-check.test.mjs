/**
 * Regression coverage for #4899: `updateSurfaceScore()` / `saveInventory()`
 * (packages/agent-core/src/audit-{regression-detector,inventory-store}.ts)
 * were fully implemented and unit-tested but had zero real callers, so every
 * surface in `.audit-state/inventory.json` sat at `checkCount: 0` forever
 * despite an active audit loop. This is the caller: `scripts/record-audit-check.mjs`
 * persists one real check result into the inventory, and
 * `.claude/skills/site-audit/SKILL.md` shells out to it after a live check.
 */

import { describe, it, expect } from "vitest";

import { parseArgs, isCompleteScores, applyScoreUpdate } from "../record-audit-check.mjs";

describe("parseArgs", () => {
  it("collects surface id and all four scores", () => {
    const args = parseArgs([
      "--surface",
      "marketing:home",
      "--performance",
      "0.95",
      "--accessibility",
      "0.92",
      "--best-practices",
      "1",
      "--seo",
      "0.98",
    ]);
    expect(args).toEqual({
      surface: "marketing:home",
      scores: { performance: 0.95, accessibility: 0.92, bestPractices: 1, seo: 0.98 },
      error: null,
    });
  });

  it("collects a surface id and an error message with no scores", () => {
    const args = parseArgs(["--surface", "api:users:health", "--error", "connection refused"]);
    expect(args).toEqual({
      surface: "api:users:health",
      scores: null,
      error: "connection refused",
    });
  });
});

describe("isCompleteScores", () => {
  it("is false for null", () => {
    expect(isCompleteScores(null)).toBe(false);
  });

  it("is false when a category is missing", () => {
    expect(isCompleteScores({ performance: 0.9, accessibility: 0.9, seo: 0.9 })).toBe(false);
  });

  it("is true when all four categories are numbers", () => {
    expect(
      isCompleteScores({ performance: 0.9, accessibility: 0.9, bestPractices: 0.9, seo: 0.9 })
    ).toBe(true);
  });
});

describe("applyScoreUpdate", () => {
  const scores = { performance: 0.91, accessibility: 0.93, bestPractices: 1, seo: 0.96 };

  const makeInventory = () => ({
    surfaces: [
      {
        id: "marketing:home",
        zone: "marketing",
        type: "page",
        url: "https://mattbutlerengineering.com/",
        sourceFiles: ["apps/marketing/src/pages/HomePage.tsx"],
        auth: "none",
        lastChecked: null,
        lastScore: null,
        checkHistory: [],
        checkCount: 0,
      },
      {
        id: "hospitality:home",
        zone: "hospitality",
        type: "page",
        url: "https://mattbutlerengineering.com/hospitality",
        sourceFiles: ["apps/hospitality/src/pages/HomePage.tsx"],
        auth: "auth0",
        lastChecked: null,
        lastScore: null,
        checkHistory: [],
        checkCount: 0,
      },
    ],
    lastUpdated: "2026-01-01T00:00:00.000Z",
    version: 1,
  });

  it("persists a real score into the matching surface, leaving others untouched", () => {
    const { inventory, updated } = applyScoreUpdate(makeInventory(), "marketing:home", scores);

    expect(updated).toBe(true);
    const marketing = inventory.surfaces.find((s) => s.id === "marketing:home");
    expect(marketing.checkCount).toBe(1);
    expect(marketing.lastScore).toEqual(scores);
    expect(marketing.checkHistory).toHaveLength(1);

    const hospitality = inventory.surfaces.find((s) => s.id === "hospitality:home");
    expect(hospitality.checkCount).toBe(0);
    expect(hospitality.lastScore).toBeNull();
  });

  it("reports updated: false and leaves the inventory untouched for an unknown surface id", () => {
    const original = makeInventory();
    const { inventory, updated } = applyScoreUpdate(original, "does-not-exist", scores);

    expect(updated).toBe(false);
    expect(inventory).toBe(original);
  });
});
