import { describe, it, expect } from "vitest";
import { computeDriftSignature } from "../lib/nightly-compliance-signature.mjs";

/** Builds a synthetic nightly-compliance report.md matching the real
 * workflow's shape: a "Lint, typecheck, test" section (fence AFTER the
 * marker) and an "ACMM audit" section (fence BEFORE the marker). */
function reportWithTestTimeout({ date, durationMs }) {
  return [
    "## Lint, typecheck, test",
    "",
    "- ✓ `pnpm lint` passed",
    "",
    "- ✗ `pnpm test` FAILED",
    "",
    "  ```",
    `  FAIL packages/rialto/src/components/Foo.test.tsx`,
    `  Error: Test timed out in ${durationMs}ms.`,
    "  ```",
    "",
    "## ACMM audit",
    "",
    "```",
    `Ran at ${date}T09:00:00Z`,
    "Behavioral gates (strict): 12/12 passing",
    "```",
    "",
    "- ✓ `acmm audit` ran to completion",
    "",
    "## Summary",
    "",
    `Drift: 1 failures, 2 passes (as of ${date})`,
  ].join("\n");
}

function reportWithGatingScriptFailure({ date }) {
  return [
    "## Gating scripts",
    "",
    "- ✗ `check-ai-antipatterns` FAILED",
    "",
    "  ```",
    "  Found 3 antipattern violations in packages/foo/bar.ts",
    "  ```",
    "",
    "## Summary",
    "",
    `Drift: 1 failures, 0 passes (as of ${date})`,
  ].join("\n");
}

describe("computeDriftSignature", () => {
  it("is a pure function of the report content — same input, same output", () => {
    const report = reportWithTestTimeout({ date: "2026-09-01", durationMs: 5000 });
    expect(computeDriftSignature(report)).toBe(computeDriftSignature(report));
  });

  it("produces the same signature across two nights of the identical underlying failure, despite different dates and timings", () => {
    const night1 = reportWithTestTimeout({ date: "2026-08-31", durationMs: 5000 });
    const night2 = reportWithTestTimeout({ date: "2026-09-06", durationMs: 5231 });

    expect(computeDriftSignature(night1)).toBe(computeDriftSignature(night2));
  });

  it("does not take the date as an input — signature is identical when only the date changes", () => {
    const a = reportWithTestTimeout({ date: "2026-01-01", durationMs: 5000 });
    const b = reportWithTestTimeout({ date: "2099-12-31", durationMs: 5000 });

    expect(computeDriftSignature(a)).toBe(computeDriftSignature(b));
  });

  it("produces a different signature for a genuinely different failure", () => {
    const testTimeout = reportWithTestTimeout({ date: "2026-09-01", durationMs: 5000 });
    const gatingFailure = reportWithGatingScriptFailure({ date: "2026-09-01" });

    expect(computeDriftSignature(testTimeout)).not.toBe(computeDriftSignature(gatingFailure));
  });

  it("returns a stable, non-empty string", () => {
    const report = reportWithTestTimeout({ date: "2026-09-01", durationMs: 5000 });
    const signature = computeDriftSignature(report);

    expect(typeof signature).toBe("string");
    expect(signature.length).toBeGreaterThan(0);
  });
});
