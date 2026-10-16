import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverWorkspaceGlobs, resolveGlob } from "../dep-graph-discovery.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

/**
 * Pins the leg topology from architecture.md decision 1: three named heavy
 * packages plus an exclusion-derived `rest`. Named legs are deliberately
 * fixed strings, not derived from disk — the point of the guard is to catch
 * drift *against* this fixed mapping, not to regenerate it.
 */
const NAMED_LEGS = {
  reservations: "@mbe/reservations-service",
  hospitality: "@mbe/hospitality",
  rialto: "@mattbutlerengineering/rialto",
};
const NAMED_PACKAGES = Object.values(NAMED_LEGS);
const LEG_NAMES = [...Object.keys(NAMED_LEGS), "rest"];

/**
 * Textual block extraction for a top-level job, matching the pattern in
 * ci-lint-critical-path.test.mjs / ci-turbo-cache.test.mjs: this repo parses
 * ci.yml as text rather than with a YAML parser, because a parser would
 * normalize away the exact literal strings (filter flags, env values) these
 * guards pin.
 */
function jobBlock(jobName) {
  const lines = WORKFLOW.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^ {2}${jobName}:\\s*$`).test(l));
  if (start === -1) throw new Error(`ci.yml has no top-level \`${jobName}:\` job`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

function needsOf(jobName) {
  const match = jobBlock(jobName).match(/^ {4}needs:\s*\[([^\]]*)\]/m);
  if (!match) throw new Error(`\`${jobName}\` has no inline needs list`);
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Every workspace package.json (by disk enumeration) that declares test:coverage. */
function packagesWithTestCoverage() {
  const names = [];
  for (const glob of discoverWorkspaceGlobs(ROOT)) {
    for (const { pkgJsonPath } of resolveGlob(glob, ROOT)) {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      if (pkg.scripts?.["test:coverage"]) names.push(pkg.name);
    }
  }
  return names.sort();
}

describe("ci.yml test matrix legs (WO-0056 guard)", () => {
  let testBlock;
  try {
    testBlock = jobBlock("test");
  } catch {
    testBlock = "";
  }

  describe("leg axis", () => {
    it("test job declares a leg matrix axis with the four named values", () => {
      const match = testBlock.match(/^ {8}leg:\s*\[([^\]]*)\]/m);
      expect(match, "`test` job has no `leg:` matrix axis").toBeTruthy();
      const legs = match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      expect(legs).toEqual(LEG_NAMES);
    });
  });

  describe.each(Object.entries(NAMED_LEGS))("%s leg", (_leg, pkg) => {
    it(`filters to ${pkg}`, () => {
      expect(testBlock).toContain(`--filter=${pkg}`);
    });

    it(`is not itself excluded (no --filter=!${pkg} outside the rest leg)`, () => {
      // Guards against a copy-paste leg definition negating its own package.
      const occurrences = testBlock.split(`--filter=!${pkg}`).length - 1;
      // Exactly one exclusion is expected (the rest leg's filter list);
      // the named leg's own line must never carry the negated form.
      expect(occurrences).toBe(1);
    });
  });

  describe("rest leg", () => {
    it("excludes exactly the three named packages", () => {
      for (const pkg of NAMED_PACKAGES) {
        expect(testBlock).toContain(`--filter=!${pkg}`);
      }
    });

    it("excludes nothing beyond the three named packages", () => {
      const excluded = [...testBlock.matchAll(/--filter=!(\S+)/g)].map((m) => m[1]);
      expect(new Set(excluded)).toEqual(new Set(NAMED_PACKAGES));
    });
  });

  describe("exactly-one-leg coverage (disk-enumerated)", () => {
    const onDisk = packagesWithTestCoverage();

    it("every named leg package still exists on disk with test:coverage", () => {
      for (const pkg of NAMED_PACKAGES) {
        expect(onDisk, `${pkg} no longer has a test:coverage script`).toContain(pkg);
      }
    });

    it("the three named packages are mutually distinct (no double-counted leg)", () => {
      expect(new Set(NAMED_PACKAGES).size).toBe(NAMED_PACKAGES.length);
    });

    it("no disk package outside the named three is claimed by an inclusion filter", () => {
      // Every `--filter=<pkg>` (not negated) in the test job must be one of
      // the three named packages — otherwise a package could be covered by
      // two legs (its own inclusion filter, plus falling into `rest` too).
      const included = [...testBlock.matchAll(/--filter=(?!!)(\S+)/g)].map((m) => m[1]);
      for (const pkg of included) {
        expect(NAMED_PACKAGES, `unexpected inclusion filter for ${pkg}`).toContain(pkg);
      }
    });

    it("zero-or-two-leg coverage is impossible by construction: rest = disk minus named", () => {
      // The rest leg's exclusion set must equal exactly the named set, so
      // every on-disk test:coverage package not in NAMED_PACKAGES falls into
      // `rest` (one leg) and every named package falls into its own leg
      // (one leg) — never zero, never two.
      const excluded = new Set([...testBlock.matchAll(/--filter=!(\S+)/g)].map((m) => m[1]));
      expect(excluded).toEqual(new Set(NAMED_PACKAGES));
      const uncoveredOnDisk = onDisk.filter(
        (pkg) => !NAMED_PACKAGES.includes(pkg) && !excluded.has(pkg)
      );
      expect(uncoveredOnDisk).toEqual([]);
    });
  });
});

describe("ci-gate wiring (WO-0056 guard)", () => {
  it("ci-gate needs test-coverage-gate", () => {
    expect(needsOf("ci-gate")).toContain("test-coverage-gate");
  });

  it("ci-gate still needs test", () => {
    expect(needsOf("ci-gate")).toContain("test");
  });
});

describe("coverage threshold ownership (WO-0056 guard)", () => {
  it("test-coverage-gate declares COVERAGE_THRESHOLD: 60", () => {
    const block = jobBlock("test-coverage-gate");
    expect(block).toMatch(/COVERAGE_THRESHOLD:\s*60\b/);
  });

  it("test job no longer owns COVERAGE_THRESHOLD", () => {
    expect(testBlockOrEmpty()).not.toMatch(/COVERAGE_THRESHOLD/);
  });

  it("agent-core coverage step keeps the literal 80% threshold", () => {
    const block = jobBlock("test-coverage-gate");
    expect(block).toMatch(/PCT"\s*-lt\s*80\s*\]/);
  });
});

function testBlockOrEmpty() {
  try {
    return jobBlock("test");
  } catch {
    return "";
  }
}
