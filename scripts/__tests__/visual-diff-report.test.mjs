import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseVisualReport, parseMaxDiffPixels } from "../visual-diff-report.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "fixtures");

const REPORT = JSON.parse(readFileSync(resolve(FIXTURES, "playwright-visual-report.json"), "utf8"));
const CONFIG_SOURCE = readFileSync(
  resolve(FIXTURES, "playwright-config-commented-ratio.txt"),
  "utf8"
);

const MODULE_SOURCE = readFileSync(resolve(__dirname, "../visual-diff-report.mjs"), "utf8");

/** Independent walk of the fixture, so `total` is never compared to a literal. */
function countSpecs(suite, acc = { n: 0 }) {
  for (const _ of suite.specs ?? []) acc.n += 1;
  for (const child of suite.suites ?? []) countSpecs(child, acc);
  return acc.n;
}

const parsed = parseVisualReport(REPORT);
const byName = new Map(parsed.changed.map((c) => [c.name, c]));

// ---------------------------------------------------------------------------
// Purity — the whole point of the split is that this module has no I/O edge.
// ---------------------------------------------------------------------------

describe("visual-diff-report.mjs is pure", () => {
  it("imports no filesystem, process or GitHub client", () => {
    expect(MODULE_SOURCE).not.toMatch(/node:fs/);
    expect(MODULE_SOURCE).not.toMatch(/node:child_process/);
    expect(MODULE_SOURCE).not.toMatch(/gh-client/);
  });
});

// ---------------------------------------------------------------------------
// parseVisualReport — total
// ---------------------------------------------------------------------------

describe("parseVisualReport total", () => {
  it("derives the denominator from the report's own spec count", () => {
    // SC-2's denominator must never be able to go stale: the suite is 49
    // snapshots today and the comment says "X of <total>". Comparing against a
    // literal here would just move the staleness into the test.
    const expected = REPORT.suites.reduce((sum, s) => sum + countSpecs(s), 0);
    expect(parsed.total).toBe(expected);
  });

  it("counts passing specs in the total but not in changed", () => {
    expect(parsed.total).toBeGreaterThan(parsed.changed.length);
  });
});

// ---------------------------------------------------------------------------
// parseVisualReport — the three buckets. A spec is passing, changed, or failed
// for some other reason; the third bucket exists because conflating it with the
// first tells the reader a hard failure was fine.
// ---------------------------------------------------------------------------

/** A spec that failed with an error message and the attachments (if any) it produced. */
function failingSpec(title, message, attachments) {
  return {
    title,
    ok: false,
    tests: [{ results: [{ retry: 0, status: "failed", errors: [{ message }], attachments }] }],
  };
}

describe("parseVisualReport buckets", () => {
  // The reproduction from review, verbatim: three specs, one a real 579 px
  // snapshot diff, two hard failures that produced no -actual attachment at all.
  // Deriving "unchanged" as `total - changed.length` renders these two as
  // "2 of 3 snapshots unchanged" — telling the reader, and the autonomous review
  // layer reading the comment, that two specs which never ran to a comparison
  // were fine. That directly misleads PRD user story 4.
  const REPORT_WITH_HARD_FAILURES = {
    suites: [
      {
        title: "visual.spec.ts",
        specs: [
          failingSpec(
            "light / button-variants",
            "Screenshot comparison failed:\n  579 pixels (ratio 0.01 of all image pixels) are different.",
            [
              { name: "light-button-variants-actual.png", path: "/w/test-results/x/a-actual.png" },
              { name: "light-button-variants-diff.png", path: "/w/test-results/x/a-diff.png" },
            ]
          ),
          failingSpec("light / dialog-open", "Error: page.goto: net::ERR_CONNECTION_REFUSED", []),
          failingSpec("light / drawer-open", "Test timeout of 30000ms exceeded.", []),
        ],
      },
    ],
  };

  const buckets = parseVisualReport(REPORT_WITH_HARD_FAILURES);

  it("counts the one real snapshot diff as changed", () => {
    expect(buckets.total).toBe(3);
    expect(buckets.changed).toHaveLength(1);
  });

  it("does NOT count a spec that failed without a snapshot diff as unchanged", () => {
    expect(buckets.unchanged).toBe(0);
  });

  it("carries the hard failures in their own bucket, so the caller can say so", () => {
    expect(buckets.failedWithoutDiff).toBe(2);
  });

  it("counts the fixture's flake as unchanged, not as a failure", () => {
    // A spec that failed then passed is `ok: true`: it is neither a regression
    // nor an unexplained failure.
    expect(parsed.unchanged).toBe(1);
    expect(parsed.failedWithoutDiff).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseVisualReport — the -expected trap
// ---------------------------------------------------------------------------

describe("parseVisualReport image paths", () => {
  const record = byName.get("light-button-variants");

  it("finds the changed snapshot by its attachment base name", () => {
    expect(record).toBeDefined();
  });

  it("derives the baseline path from the -actual attachment, inside test-results/", () => {
    // The -expected attachment points at the COMMITTED baseline
    // (e2e/screenshots/…), which is NOT inside the uploaded artifact. The
    // identical bytes are written next to the actual as <base>-expected.png.
    // Getting this backwards produces a comment whose baseline column 404s.
    expect(record.expectedPath).toContain("/test-results/");
    expect(record.expectedPath).not.toContain("/screenshots/");
    expect(record.expectedPath).toBe(record.actualPath.replace("-actual.png", "-expected.png"));
  });

  it("takes the actual and diff paths from their own attachments", () => {
    expect(record.actualPath).toMatch(/light-button-variants-actual\.png$/);
    expect(record.actualPath).toContain("/test-results/");
    expect(record.diffPath).toMatch(/light-button-variants-diff\.png$/);
    expect(record.diffPath).toContain("/test-results/");
  });

  it("never returns the raw -expected attachment path for any changed record", () => {
    for (const record2 of parsed.changed) {
      if (record2.expectedPath === null) continue;
      expect(record2.expectedPath).not.toContain("/screenshots/");
    }
  });
});

// ---------------------------------------------------------------------------
// parseVisualReport — pixel counts
// ---------------------------------------------------------------------------

describe("parseVisualReport pixel counts", () => {
  it("recovers the count from an ANSI-wrapped matcher message", () => {
    // The JSON reporter formats through nonTerminalScreen, whose colors are
    // inherited from the terminal — so real messages arrive escape-wrapped.
    const raw = JSON.stringify(REPORT);
    expect(raw).toContain("\\u001b[");
    expect(byName.get("light-button-variants").pixels).toBe(579);
  });

  it("returns pixels: null for an unparsable message, with no guessed number", () => {
    const record = byName.get("light-unparsable");
    expect(record).toBeDefined();
    expect(record.pixels).toBeNull();
  });

  it("reads a count that is preceded by a size-mismatch clause", () => {
    expect(byName.get("light-size-mismatch").pixels).toBe(91520);
  });
});

// ---------------------------------------------------------------------------
// parseVisualReport — retries
// ---------------------------------------------------------------------------

describe("parseVisualReport retries", () => {
  it("omits a spec that failed then passed — a flake is not a regression", () => {
    expect(byName.has("light-retry-flake")).toBe(false);
  });

  it("reads only the highest-retry entry of a spec that failed twice", () => {
    expect(byName.get("light-retry-persistent").pixels).toBe(4242);
  });
});

// ---------------------------------------------------------------------------
// parseVisualReport — reason
// ---------------------------------------------------------------------------

describe("parseVisualReport reason", () => {
  it("labels an ordinary pixel difference", () => {
    expect(byName.get("light-button-variants").reason).toBe("pixel-diff");
  });

  it("labels a size mismatch, even though the message also carries a count", () => {
    expect(byName.get("light-size-mismatch").reason).toBe("size-mismatch");
  });

  it("labels a missing baseline, and reports no baseline or diff image for it", () => {
    const record = byName.get("light-brand-new");
    expect(record.reason).toBe("missing-baseline");
    expect(record.pixels).toBeNull();
    expect(record.expectedPath).toBeNull();
    expect(record.diffPath).toBeNull();
    expect(record.actualPath).toContain("/test-results/");
  });
});

// ---------------------------------------------------------------------------
// parseVisualReport — degenerate reports
// ---------------------------------------------------------------------------

describe("parseVisualReport degenerate reports", () => {
  it("returns changed: [] for a suite-level failure with no snapshot diffs", () => {
    // A webServer timeout fails the job with zero changed snapshots. The
    // comment must never claim "0 of 49 changed" as though that were a finding.
    const report = {
      config: { configFile: "/w/apps/rialto-web/playwright.config.ts" },
      suites: [
        {
          title: "visual.spec.ts",
          specs: [
            {
              title: "light / button-variants",
              ok: false,
              tests: [
                {
                  results: [
                    {
                      retry: 0,
                      status: "failed",
                      errors: [
                        { message: "Error: Timed out waiting 60000ms from config.webServer." },
                      ],
                      attachments: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      errors: [{ message: "Error: Timed out waiting 60000ms from config.webServer." }],
    };
    expect(parseVisualReport(report)).toEqual({
      total: 1,
      changed: [],
      unchanged: 0,
      failedWithoutDiff: 1,
    });
  });

  it("does not throw on an empty or malformed report", () => {
    const empty = { total: 0, changed: [], unchanged: 0, failedWithoutDiff: 0 };
    expect(parseVisualReport({})).toEqual(empty);
    expect(parseVisualReport(null)).toEqual(empty);
    expect(parseVisualReport({ suites: [{ specs: [{ ok: false }] }] })).toEqual({
      total: 1,
      changed: [],
      unchanged: 0,
      failedWithoutDiff: 1,
    });
  });

  it("walks nested suites", () => {
    const nested = {
      suites: [{ suites: [{ specs: [{ title: "a", ok: true, tests: [] }] }] }],
    };
    expect(parseVisualReport(nested).total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// parseMaxDiffPixels
// ---------------------------------------------------------------------------

describe("parseMaxDiffPixels", () => {
  it("reads the live budget out of the real config, ignoring the commented-out ratio", () => {
    // THE load-bearing case. apps/rialto-web/playwright.config.ts carries a
    // commented-out `maxDiffPixelRatio: 0.01` inside the // prose at line 23
    // and its only live setting, `maxDiffPixels: 300`, at line 28. A
    // comment-blind parse sees a ratio that is not configured, returns null,
    // and silently degrades every comment this feature ever posts.
    expect(CONFIG_SOURCE).toContain("// maxDiffPixelRatio");
    expect(parseMaxDiffPixels(CONFIG_SOURCE)).toBe(300);
  });

  it("returns null when no maxDiffPixels is configured", () => {
    expect(parseMaxDiffPixels("export default defineConfig({ testDir: './e2e' });")).toBeNull();
  });

  it("returns null when more than one maxDiffPixels is present", () => {
    const source = `
      export default defineConfig({
        expect: { toHaveScreenshot: { maxDiffPixels: 300 } },
        projects: [{ name: "wide", expect: { toHaveScreenshot: { maxDiffPixels: 900 } } }],
      });
    `;
    expect(parseMaxDiffPixels(source)).toBeNull();
  });

  it("returns null when a LIVE maxDiffPixelRatio sits alongside maxDiffPixels", () => {
    // The enforced budget is then min(maxDiffPixels, w × h × ratio) — per
    // image, and therefore not a single number a comment could name.
    const source = `
      expect: { toHaveScreenshot: { maxDiffPixels: 300, maxDiffPixelRatio: 0.01 } },
    `;
    expect(parseMaxDiffPixels(source)).toBeNull();
  });

  it("returns null for a lone maxDiffPixelRatio — never a substituted default", () => {
    expect(parseMaxDiffPixels("maxDiffPixelRatio: 0.01,")).toBeNull();
  });

  it("does not mistake maxDiffPixelRatio for maxDiffPixels", () => {
    expect(parseMaxDiffPixels("maxDiffPixelRatio: 0.01, maxDiffPixels: 42,")).toBeNull();
    expect(parseMaxDiffPixels("maxDiffPixels: 42,")).toBe(42);
  });

  it("ignores a block-commented budget", () => {
    expect(parseMaxDiffPixels("/* maxDiffPixels: 900 */ maxDiffPixels: 12,")).toBe(12);
  });

  it("does not let a URL containing // swallow a following budget", () => {
    const source = `
      use: { baseURL: "http://localhost:5173/rialto/" },
      expect: { toHaveScreenshot: { maxDiffPixels: 300 } },
    `;
    expect(parseMaxDiffPixels(source)).toBe(300);
  });

  it("reads a numeric separator", () => {
    expect(parseMaxDiffPixels("maxDiffPixels: 1_000,")).toBe(1000);
  });

  it("never throws on malformed input", () => {
    expect(parseMaxDiffPixels("")).toBeNull();
    expect(parseMaxDiffPixels(null)).toBeNull();
    expect(parseMaxDiffPixels(undefined)).toBeNull();
    expect(parseMaxDiffPixels(42)).toBeNull();
    expect(parseMaxDiffPixels('const s = "unterminated')).toBeNull();
    expect(parseMaxDiffPixels("maxDiffPixels: not-a-number,")).toBeNull();
  });
});
