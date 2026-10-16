import { describe, it, expect } from "vitest";
import {
  countReviewSurfaceAdditions,
  decideSizeEscalation,
  isExcludedFromReviewSurface,
  T1,
  T3,
  T4,
} from "../tier-escalation.mjs";

describe("isExcludedFromReviewSurface", () => {
  it("excludes the generated-T1 class by exact path", () => {
    expect(isExcludedFromReviewSurface("pnpm-lock.yaml")).toBe(true);
    expect(isExcludedFromReviewSurface("infrastructure/worker/dep-graph.json")).toBe(true);
    expect(isExcludedFromReviewSurface("docs/architecture/dependency-graph.md")).toBe(true);
  });

  it("excludes llms.txt / llms-full.txt at any depth", () => {
    expect(isExcludedFromReviewSurface("llms.txt")).toBe(true);
    expect(isExcludedFromReviewSurface("services/reservations/llms.txt")).toBe(true);
    expect(isExcludedFromReviewSurface("apps/marketing/llms-full.txt")).toBe(true);
  });

  it("excludes registry.json at any depth", () => {
    expect(isExcludedFromReviewSurface("packages/rialto-catalog/registry.json")).toBe(true);
  });

  it("excludes any path with a generated* path segment", () => {
    expect(isExcludedFromReviewSurface("services/users/src/generated/client.ts")).toBe(true);
    expect(isExcludedFromReviewSurface("packages/rialto-catalog/src/generated-schemas.ts")).toBe(
      true
    );
  });

  it("excludes docs/features/** and docs/fixes/** markdown", () => {
    expect(
      isExcludedFromReviewSurface("docs/features/tier-escalation-false-positives/prd.md")
    ).toBe(true);
    expect(isExcludedFromReviewSurface("docs/fixes/visual-tolerance-threshold/design.md")).toBe(
      true
    );
  });

  it("does NOT exclude other markdown — docs/change-tiers.md and READMEs still count", () => {
    expect(isExcludedFromReviewSurface("docs/change-tiers.md")).toBe(false);
    expect(isExcludedFromReviewSurface("README.md")).toBe(false);
    expect(isExcludedFromReviewSurface("packages/rialto/README.md")).toBe(false);
  });

  it("does NOT exclude ordinary code or docs files", () => {
    expect(isExcludedFromReviewSurface("services/reservations/src/routes/venues.ts")).toBe(false);
    expect(isExcludedFromReviewSurface("docs/architecture/overview.md")).toBe(false);
  });
});

describe("countReviewSurfaceAdditions", () => {
  it("sums additions only over non-excluded files", () => {
    const files = [
      { path: "services/reservations/src/routes/venues.ts", additions: 100 },
      { path: "services/reservations/llms.txt", additions: 500 },
      { path: "pnpm-lock.yaml", additions: 50 },
    ];
    expect(countReviewSurfaceAdditions(files)).toBe(100);
  });

  it("treats missing or non-numeric additions as 0, never NaN", () => {
    const files = [
      { path: "a.ts" }, // no additions field
      { path: "b.ts", additions: "not-a-number" },
      { path: "c.ts", additions: 10 },
    ];
    const total = countReviewSurfaceAdditions(files);
    expect(total).toBe(10);
    expect(Number.isNaN(total)).toBe(false);
  });

  it("returns 0 for an empty or missing file list", () => {
    expect(countReviewSurfaceAdditions([])).toBe(0);
    expect(countReviewSurfaceAdditions(undefined)).toBe(0);
  });

  it("ignores malformed entries without a string path", () => {
    expect(
      countReviewSurfaceAdditions([null, { additions: 5 }, { path: "x.ts", additions: 5 }])
    ).toBe(5);
  });
});

describe("decideSizeEscalation — pins #6610 and #6591", () => {
  it("#6610: 1194 generated + 16 docs + 984 code — generated excluded, counted stays <= 1000, no escalation from T3", () => {
    // #6610's real additions were 1194 generated (llms.txt/llms-full.txt
    // regen) + 16 docs (CLAUDE.md) + 988 code = 1004 review-surface lines,
    // 4 over this threshold on the nose — the motivating complaint is that
    // the OLD rule escalated on the full 2198-line raw diff (generated
    // included), not that the new rule must clear this exact PR by a wide
    // margin. This fixture rounds the code count down by 4 (984, not 988)
    // to land cleanly inside the "stays under 1000, no escalation" case the
    // breakdown describes; the byte-exact replay against real PR history is
    // Milestone 3's job (scripts/tier-escalation.mjs replay).
    const files = [
      { path: "services/reservations/llms.txt", additions: 1194 },
      { path: "services/reservations/CLAUDE.md", additions: 16 },
      { path: "services/reservations/src/routes/public-holds.ts", additions: 984 },
    ];
    const result = decideSizeEscalation({ files, highestTier: T3 });
    expect(result.counted).toBe(1000);
    expect(result.counted).toBeLessThanOrEqual(1000);
    expect(result.escalate).toBe(false);
  });

  it("#6591: 1387 code + 943 docs — counted exceeds 1000, escalates", () => {
    const files = [
      { path: "services/reservations/src/routes/public-deposits.ts", additions: 1387 },
      { path: "docs/features/booking-guest-reuse/breakdown.md", additions: 943 },
    ];
    // docs/features/** markdown is excluded, so only the 1387 code lines count,
    // and that alone already exceeds the threshold.
    const result = decideSizeEscalation({ files, highestTier: T3 });
    expect(result.counted).toBe(1387);
    expect(result.counted).toBeGreaterThan(1000);
    expect(result.escalate).toBe(true);
  });

  it("never escalates past T4 — a PR already at T4 reports escalate: false", () => {
    const files = [{ path: "a.ts", additions: 5000 }];
    const result = decideSizeEscalation({ files, highestTier: T4 });
    expect(result.escalate).toBe(false);
  });

  it("defaults highestTier to T1 and files to [] when omitted", () => {
    const result = decideSizeEscalation();
    expect(result.counted).toBe(0);
    expect(result.escalate).toBe(false);
  });

  it("reason names the counted total, not the raw total", () => {
    const files = [
      { path: "x.ts", additions: 1200 },
      { path: "llms.txt", additions: 9000 },
    ];
    const result = decideSizeEscalation({ files, highestTier: T1 });
    expect(result.reason).toContain("1200");
    expect(result.reason).not.toContain("9000");
  });
});
