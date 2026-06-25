import { describe, it, expect } from "vitest";

import {
  findStalestZone,
  updateSurfaceScore,
  detectRegression,
} from "../audit-regression-detector.js";
import { ZONES } from "../audit-surface-registry.js";
import type { AuditInventory, AuditSurface, LighthouseScores } from "../audit-surface-registry.js";

// Minimal 2-surface fixture — avoids importing the full registry
const makeInventory = (overrides: Partial<AuditSurface>[] = []): AuditInventory => {
  const base: AuditSurface[] = [
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
  ];

  const merged = base.map((s, i) => ({ ...s, ...(overrides[i] ?? {}) }));

  return {
    surfaces: merged,
    lastUpdated: new Date().toISOString(),
    version: 1,
  };
};

// ── findStalestZone ─────────────────────────────────────────────────

describe("findStalestZone", () => {
  it("returns a valid zone", () => {
    const inv = makeInventory();
    expect(ZONES).toContain(findStalestZone(inv));
  });

  it("prefers unchecked surfaces over recently checked ones", () => {
    const now = new Date().toISOString();
    const inv = makeInventory([{ lastChecked: now }, {}]);
    // marketing is recently checked, hospitality is null → hospitality should be stalest
    const stalest = findStalestZone(inv);
    expect(stalest).toBe("hospitality");
  });
});

// ── updateSurfaceScore ──────────────────────────────────────────────

describe("updateSurfaceScore", () => {
  const scores: LighthouseScores = {
    performance: 0.95,
    accessibility: 0.98,
    bestPractices: 0.92,
    seo: 0.97,
  };

  it("updates lastChecked, lastScore, and appends to checkHistory", () => {
    const surface = makeInventory().surfaces[0];
    const updated = updateSurfaceScore(surface, scores);
    expect(updated.lastChecked).toBeTruthy();
    expect(updated.lastScore).toEqual(scores);
    expect(updated.checkHistory).toHaveLength(1);
    expect(updated.checkCount).toBe(1);
  });

  it("caps checkHistory at 10 entries", () => {
    let s = makeInventory().surfaces[0];
    for (let i = 0; i < 12; i++) s = updateSurfaceScore(s, scores);
    expect(s.checkHistory).toHaveLength(10);
    expect(s.checkCount).toBe(12);
  });

  it("does not mutate the original surface", () => {
    const original = makeInventory().surfaces[0];
    updateSurfaceScore(original, scores);
    expect(original.lastChecked).toBeNull();
    expect(original.checkCount).toBe(0);
  });
});

// ── detectRegression ────────────────────────────────────────────────

describe("detectRegression", () => {
  it("returns null when no previous score", () => {
    const surface = makeInventory().surfaces[0];
    expect(
      detectRegression(surface, {
        performance: 0.95,
        accessibility: 0.98,
        bestPractices: 0.92,
        seo: 0.97,
      })
    ).toBeNull();
  });

  it("detects regression when score drops >0.05", () => {
    const surface: AuditSurface = {
      ...makeInventory().surfaces[0],
      lastScore: { performance: 0.95, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 },
    };
    const reg = detectRegression(surface, {
      performance: 0.85,
      accessibility: 0.98,
      bestPractices: 0.92,
      seo: 0.97,
    });
    expect(reg).not.toBeNull();
    expect(reg!.category).toBe("performance");
    expect(reg!.drop).toBeCloseTo(0.1);
  });

  it("returns null when drop <=0.05", () => {
    const surface: AuditSurface = {
      ...makeInventory().surfaces[0],
      lastScore: { performance: 0.95, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 },
    };
    expect(
      detectRegression(surface, {
        performance: 0.92,
        accessibility: 0.98,
        bestPractices: 0.92,
        seo: 0.97,
      })
    ).toBeNull();
  });

  it("reports worst regression across categories", () => {
    const surface: AuditSurface = {
      ...makeInventory().surfaces[0],
      lastScore: { performance: 0.95, accessibility: 0.95, bestPractices: 0.95, seo: 0.95 },
    };
    const reg = detectRegression(surface, {
      performance: 0.8,
      accessibility: 0.85,
      bestPractices: 0.95,
      seo: 0.95,
    });
    expect(reg!.category).toBe("performance");
    expect(reg!.drop).toBeCloseTo(0.15);
  });
});
