import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  SHIPPED_FEATURES,
  findShippedFeature,
  isShippedFeaturesSnapshot,
  selectShippedFeatures,
} from "./shipped-features.js";

const PR = {
  number: 10,
  title: "feat: thing",
  mergedAt: "2026-10-10T10:00:00.000Z",
  mergeCommit: "abc123",
  reviewVerdict: "pass",
  ciGate: "success",
} as const;

const FEATURE = {
  slug: "alpha",
  title: "Alpha",
  trackingIssue: 100,
  proposalIssue: 90,
  proposalEvidence: "evidence",
  proposedAt: "2026-10-01T00:00:00.000Z",
  firstMergedAt: "2026-10-05T00:00:00.000Z",
  lastMergedAt: "2026-10-10T00:00:00.000Z",
  wallClockHours: 120,
  liveUrl: "/alpha",
  children: [{ issue: 101, title: "Part 1", prs: [PR] }],
};

const snapshot = (features: unknown[]) => ({ generatedAt: "2026-10-16T00:00:00.000Z", features });

describe("isShippedFeaturesSnapshot", () => {
  it("accepts a well-formed snapshot and the empty seed", () => {
    expect(isShippedFeaturesSnapshot(snapshot([FEATURE]))).toBe(true);
    expect(isShippedFeaturesSnapshot(snapshot([]))).toBe(true);
  });

  it("accepts null optional fields", () => {
    const f = {
      ...FEATURE,
      proposalIssue: null,
      proposalEvidence: null,
      proposedAt: null,
      liveUrl: null,
    };
    expect(isShippedFeaturesSnapshot(snapshot([f]))).toBe(true);
  });

  it("rejects non-objects and a missing features array", () => {
    for (const value of [null, undefined, 42, "x", [snapshot([])]]) {
      expect(isShippedFeaturesSnapshot(value)).toBe(false);
    }
    expect(isShippedFeaturesSnapshot({ generatedAt: "2026-10-16T00:00:00.000Z" })).toBe(false);
  });

  it("rejects an unparseable generatedAt", () => {
    expect(isShippedFeaturesSnapshot({ generatedAt: "soon", features: [] })).toBe(false);
  });

  it("rejects a feature without a slug", () => {
    expect(isShippedFeaturesSnapshot(snapshot([{ ...FEATURE, slug: undefined }]))).toBe(false);
  });

  it("rejects non-integer issue numbers", () => {
    expect(isShippedFeaturesSnapshot(snapshot([{ ...FEATURE, trackingIssue: 1.5 }]))).toBe(false);
    expect(isShippedFeaturesSnapshot(snapshot([{ ...FEATURE, proposalIssue: "9" }]))).toBe(false);
    expect(
      isShippedFeaturesSnapshot(
        snapshot([{ ...FEATURE, children: [{ issue: 1.5, title: "x", prs: [] }] }])
      )
    ).toBe(false);
    expect(
      isShippedFeaturesSnapshot(
        snapshot([
          {
            ...FEATURE,
            children: [{ issue: 1, title: "x", prs: [{ ...PR, number: 2.5 }] }],
          },
        ])
      )
    ).toBe(false);
  });

  it("rejects unparseable dates", () => {
    expect(isShippedFeaturesSnapshot(snapshot([{ ...FEATURE, lastMergedAt: "nope" }]))).toBe(false);
    expect(isShippedFeaturesSnapshot(snapshot([{ ...FEATURE, proposedAt: "nope" }]))).toBe(false);
    expect(
      isShippedFeaturesSnapshot(
        snapshot([
          {
            ...FEATURE,
            children: [{ issue: 1, title: "x", prs: [{ ...PR, mergedAt: "nope" }] }],
          },
        ])
      )
    ).toBe(false);
  });

  it("rejects a liveUrl that is not a site-relative path", () => {
    for (const liveUrl of ["https://example.com/x", "alpha", "//evil.com", 5]) {
      expect(isShippedFeaturesSnapshot(snapshot([{ ...FEATURE, liveUrl }]))).toBe(false);
    }
  });

  it("rejects unknown review verdicts and ci gate values", () => {
    const withPr = (pr: object) => ({
      ...FEATURE,
      children: [{ issue: 1, title: "x", prs: [pr] }],
    });
    expect(isShippedFeaturesSnapshot(snapshot([withPr({ ...PR, reviewVerdict: "maybe" })]))).toBe(
      false
    );
    expect(isShippedFeaturesSnapshot(snapshot([withPr({ ...PR, ciGate: "pending" })]))).toBe(false);
    expect(
      isShippedFeaturesSnapshot(snapshot([withPr({ ...PR, reviewVerdict: null, ciGate: null })]))
    ).toBe(true);
  });
});

describe("selectShippedFeatures", () => {
  it("returns [] for malformed input", () => {
    expect(selectShippedFeatures(null)).toEqual([]);
    expect(selectShippedFeatures({ features: [{ slug: 1 }] })).toEqual([]);
  });

  it("sorts newest-first by lastMergedAt, ties broken by trackingIssue desc", () => {
    const a = { ...FEATURE, slug: "a", trackingIssue: 1, lastMergedAt: "2026-10-01T00:00:00.000Z" };
    const b = { ...FEATURE, slug: "b", trackingIssue: 2, lastMergedAt: "2026-10-09T00:00:00.000Z" };
    const c = { ...FEATURE, slug: "c", trackingIssue: 3, lastMergedAt: "2026-10-09T00:00:00.000Z" };
    expect(selectShippedFeatures(snapshot([a, b, c])).map((f) => f.slug)).toEqual(["c", "b", "a"]);
  });

  it("does not mutate its input", () => {
    const features = [
      { ...FEATURE, slug: "a", lastMergedAt: "2026-10-01T00:00:00.000Z" },
      { ...FEATURE, slug: "b", lastMergedAt: "2026-10-09T00:00:00.000Z" },
    ];
    selectShippedFeatures(snapshot(features));
    expect(features.map((f) => f.slug)).toEqual(["a", "b"]);
  });
});

describe("findShippedFeature", () => {
  it("returns undefined for a missing slug", () => {
    expect(findShippedFeature("missing")).toBeUndefined();
  });
});

describe("committed snapshot", () => {
  const raw: unknown = JSON.parse(
    readFileSync(resolve(__dirname, "./shipped-features.json"), "utf8")
  );

  it("passes the guard", () => {
    expect(isShippedFeaturesSnapshot(raw)).toBe(true);
  });

  it("is what SHIPPED_FEATURES exposes", () => {
    expect(SHIPPED_FEATURES).toEqual(selectShippedFeatures(raw));
  });
});

describe("module source", () => {
  it("never fetches at runtime", () => {
    for (const file of ["shipped-features.ts", "shipped-features.json"]) {
      const src = readFileSync(resolve(__dirname, file), "utf8");
      expect(src).not.toMatch(/fetch\(/);
      expect(src).not.toMatch(/api\.github\.com/);
    }
  });
});
