import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SCRIPTS_DIR = resolve(ROOT, "scripts");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/nightly-compliance.yml");
const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");

/**
 * Slice out a single named step's YAML text (from `- name: <name>` up to,
 * but not including, the next step at the same indentation). Parsed
 * textually, matching the precedent in ci-node-matrix.test.mjs and
 * pulumi-cli-pin.test.mjs — these are plain step lists with no anchors or
 * flow mappings a YAML library would be needed for.
 *
 * @param {string} source
 * @param {string} stepName
 * @returns {string}
 */
function extractStep(source, stepName) {
  const lines = source.split("\n");
  const startIdx = lines.findIndex((l) => l.trim() === `- name: ${stepName}`);
  if (startIdx === -1) {
    throw new Error(`nightly-compliance.yml has no step named "${stepName}"`);
  }
  const indent = lines[startIdx].match(/^(\s*)- name:/)[1];
  const nextBoundary = new RegExp(`^${indent}- name:`);
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (nextBoundary.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

/**
 * Drop full-line `#` comments (bash comments always start the line, after
 * whitespace). Used before matching real invocations/values so an
 * explanatory comment that mentions the old buggy shape in prose — e.g.
 * "used to pipe into `head -25`" — doesn't itself trip the regression
 * assertion it's describing.
 *
 * @param {string} text
 * @returns {string}
 */
function stripComments(text) {
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
}

describe("nightly-compliance.yml Lint, typecheck, test step", () => {
  const step = extractStep(WORKFLOW, "Lint, typecheck, test");

  // Regression test for the falsifiability bug: GitHub Actions' default
  // shell is `bash -e {0}` (no pipefail). `pnpm "$cmd"` run as a bare
  // statement aborts the whole step the instant it exits non-zero, so a
  // following `cmd_status=$?` line never executes — the FAILED branch was
  // dead code for the workflow's entire 100-day life. Reproduced locally:
  // an `ok, ok, fail` loop of that exact shape exits early and never prints
  // a FAILED line.
  it("captures pnpm's exit status in an -e-safe form, never a bare statement", () => {
    const invocationLines = stripComments(step)
      .split("\n")
      .filter((l) => l.includes('pnpm "$cmd"'));

    expect(invocationLines.length).toBeGreaterThan(0);

    for (const line of invocationLines) {
      const trimmed = line.trim();
      const isGuarded = trimmed.startsWith("if ") || trimmed.includes("||");
      expect(
        isGuarded,
        `"${line}" invokes pnpm "$cmd" without an if/|| guard — a non-zero ` +
          "exit here aborts the step under bash -e before any status can be read"
      ).toBe(true);
    }
  });

  it("never reintroduces the dead bare-statement-then-$? shape", () => {
    expect(step).not.toMatch(/pnpm "\$cmd"[^\n]*\n\s*cmd_status=\$\?/);
  });
});

describe("nightly-compliance.yml Run gating scripts step", () => {
  const step = extractStep(WORKFLOW, "Run gating scripts");

  // Regression test for the coverage bug: the loop scanned scripts/check-*.js
  // only, silently never running the 14 scripts/check-*.mjs gating scripts
  // (check-ai-antipatterns, check-orphaned-tests, etc.) for the workflow's
  // whole life. `ls -1 scripts/check-*.js | wc -l` is 7; `ls -1 scripts/check-*`
  // is 21.
  it("globs both scripts/check-*.js and scripts/check-*.mjs", () => {
    expect(step).toMatch(/for script in[^\n]*scripts\/check-\*\.js[^\n]*scripts\/check-\*\.mjs/);
  });

  it("has no glob extension gap against what's actually on disk", () => {
    const files = readdirSync(SCRIPTS_DIR, { withFileTypes: true })
      .filter((d) => d.isFile() && /^check-.+\.[a-z]+$/i.test(d.name))
      .map((d) => d.name);
    expect(files.length).toBeGreaterThan(0);

    const globExtensions = [...step.matchAll(/scripts\/check-\*\.([a-z]+)/g)].map((m) => m[1]);
    const extensionsOnDisk = new Set(files.map((f) => f.split(".").pop()));
    const uncoveredExtensions = [...extensionsOnDisk].filter(
      (ext) => !globExtensions.includes(ext)
    );

    expect(
      uncoveredExtensions,
      `scripts/check-*.<ext> extensions on disk with no glob coverage in the ` +
        `workflow: ${uncoveredExtensions.join(", ")}. A new check-*.<ext> file ` +
        "of an unglobbed extension would silently never run — widen the glob " +
        "or name it explicitly in the exclusion list."
    ).toEqual([]);
  });

  it("names any excluded script explicitly, with a reason, never by narrowing the glob", () => {
    const excludedBlock = step.match(/excluded=\(([\s\S]*?)\n\s*\)/);
    expect(
      excludedBlock,
      "gating-scripts step has no `excluded=(...)` array to hold documented exclusions"
    ).toBeTruthy();

    const excludedLines = excludedBlock[1].split("\n").filter((l) => l.trim().startsWith('"'));
    for (const line of excludedLines) {
      expect(line, `exclusion line "${line}" has no trailing reason comment`).toMatch(
        /^\s*"[^"]+"\s*#\s*\S/
      );
    }

    // The two scripts known (measured, not assumed) to be nightly-inappropriate
    // must stay named here — check-endpoint.mjs is a library CLI that exits 1
    // on a bare invocation with no args (always "fails" without checking
    // anything), and check-dep-sync.mjs shells to unpinned `npx depcheck` per
    // workspace package, measured at 4m33s wall time for a single full run.
    const excludedNames = [...excludedBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(excludedNames).toEqual(expect.arrayContaining(["check-endpoint", "check-dep-sync"]));
  });

  it("still captures each script's exit status via if, not a masked bare call", () => {
    expect(step).toMatch(/if node "\$script"[^\n]*; then/);
  });
});

describe("nightly-compliance.yml Run ACMM audit step", () => {
  const step = extractStep(WORKFLOW, "Run ACMM audit");

  // Regression test: the step used to pipe straight into `head -25` with no
  // pipefail, masking the audit's exit status, and — measured against a real
  // run (47 lines total) — truncating the report before the verdict lines
  // (`Behavioral gates (strict):` onward) ever printed.
  it("captures the audit's real exit status via an if, not a masked pipe", () => {
    expect(step).toMatch(/if node plugins\/acmm\/scripts\/audit\.js[^\n]*; then/);
    expect(step).not.toMatch(/audit\.js[^\n]*\|\s*head/);
  });

  it("emits a drift-visible ✓/✗ marker into the report for both outcomes", () => {
    expect(step).toMatch(/✓[^\n]*acmm audit/i);
    expect(step).toMatch(/✗[^\n]*acmm audit/i);
  });

  it("does not truncate the excerpt back down to the size that swallowed the verdict", () => {
    const headMatches = [...stripComments(step).matchAll(/head -(\d+)/g)].map((m) => Number(m[1]));
    expect(headMatches.length).toBeGreaterThan(0);
    for (const n of headMatches) {
      // A real run is 47 lines; -25 is the exact bound that cut the report
      // off mid-section last time. Anything at or below that reintroduces
      // the bug.
      expect(n).toBeGreaterThan(25);
    }
  });
});

describe("nightly-compliance.yml Detect drift step", () => {
  const step = extractStep(WORKFLOW, "Detect drift");

  it("does not weaken the ✗ contract that drift detection keys on", () => {
    expect(step).toMatch(/grep -q '✗' \/tmp\/report\.md/);
  });

  // Regression test: `grep -c` on zero matches still prints "0" but exits 1,
  // so `|| echo 0` fired on every clean run and printed a second "0" on its
  // own line, splitting the summary across two lines instead of one.
  it("does not use the || echo 0 fallback that double-printed the count", () => {
    expect(step).not.toMatch(/grep -c '[✗✓]' \/tmp\/report\.md \|\| echo 0/);
  });
});
