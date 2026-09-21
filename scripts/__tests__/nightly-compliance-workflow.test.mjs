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
  it("captures the command's exit status in an -e-safe form, never a bare statement", () => {
    // The command is built into an `argv` array first (so `test` can carry
    // its own flags) and then invoked once. Assignment lines are not
    // invocations and cannot abort the step; `"${argv[@]}"` is the one line
    // that runs anything, and it is the line that has to be guarded.
    const lines = stripComments(step).split("\n");
    const invocationLines = lines.filter(
      (l) => l.includes('"${argv[@]}"') || (l.includes('pnpm "$cmd"') && !/\w+=\(/.test(l))
    );

    expect(invocationLines.length).toBeGreaterThan(0);

    for (const line of invocationLines) {
      const trimmed = line.trim();
      const isGuarded = trimmed.startsWith("if ") || trimmed.includes("||");
      expect(
        isGuarded,
        `"${line}" invokes the command without an if/|| guard — a non-zero ` +
          "exit here aborts the step under bash -e before any status can be read"
      ).toBe(true);
    }
  });

  it("never reintroduces the dead bare-statement-then-$? shape", () => {
    expect(step).not.toMatch(/pnpm "\$cmd"[^\n]*\n\s*cmd_status=\$\?/);
    expect(step).not.toMatch(/"\$\{argv\[@\]\}"[^\n]*\n\s*cmd_status=\$\?/);
  });

  // Regression test for the ten-red-nights bug (#5203 … #5517). The nightly
  // ran bare `pnpm test`, which takes turbo's default concurrency of 10,
  // while ci.yml's Test job has been capped at 2 since #4519 — so the
  // nightly ran the same suite at 5x the parallelism of the gate that stays
  // green. Measured on one machine, same commit, same cold cache: default
  // concurrency failed (`@mbe/rialto-web#test`, page-registry.test.ts timing
  // out at 15000ms), `--concurrency=2` passed all 50 tasks. That is one run
  // per setting, not 50 runs — the CI-side A/B in #4558 is still unrun.
  it("runs the test task at the same concurrency cap ci.yml's Test job uses", () => {
    const body = stripComments(step);
    const testInvocation = body.split("\n").find((l) => /^\s*test\)/.test(l));

    expect(
      testInvocation,
      "no `test)` case branch — the test task must carry its own concurrency cap"
    ).toBeTruthy();
    expect(testInvocation).toMatch(/--concurrency=(\d+)/);

    const nightlyCap = Number(testInvocation.match(/--concurrency=(\d+)/)[1]);
    const ci = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
    const ciCaps = [...ci.matchAll(/turbo test(?::coverage)?[^\n]*--concurrency=(\d+)/g)].map((m) =>
      Number(m[1])
    );

    expect(ciCaps.length, "ci.yml's test job no longer declares a concurrency cap").toBeGreaterThan(
      0
    );
    expect(
      nightlyCap,
      `nightly runs the test task at --concurrency=${nightlyCap} while ci.yml ` +
        `caps it at ${ciCaps.join("/")}. A nightly more parallel than the green ` +
        "gate re-creates the timeout treadmill of #5203…#5517."
    ).toBeLessThanOrEqual(Math.min(...ciCaps));
  });

  // Regression test for the un-diagnosable report (#5517). `tail -10` of a
  // turbo transcript is always `Tasks:`/`Failed:` and never the failing
  // test, so ten consecutive nightly issues named a package and nothing else.
  it("quotes the failure through the summarizer, never a bare tail", () => {
    const body = stripComments(step);

    expect(body).toMatch(/node scripts\/summarize-task-failure\.mjs "\/tmp\/\$cmd\.out"/);
    expect(
      body,
      "the failure branch is back to `tail -N` of the captured output, which " +
        "cannot reach the failing test name in a turbo transcript"
    ).not.toMatch(/tail -\d+ "\/tmp\/\$cmd\.out"/);
  });
});

describe("nightly-compliance.yml captured-output artifact", () => {
  // The in-issue summary is capped by design, so the full transcripts have to
  // stay retrievable — otherwise diagnosing a nightly failure still means
  // reproducing it by hand, which is what #5517 cost.
  it("uploads the captured command output, even when the run failed", () => {
    const step = extractStep(WORKFLOW, "Upload captured command output");

    expect(step).toMatch(/if:\s*always\(\)/);
    expect(step).toMatch(/uses:\s*actions\/upload-artifact@[0-9a-f]{40}/);
    expect(step).toMatch(/path:\s*\/tmp\/\*\.out/);
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

    // The scripts known (measured, not assumed) to be nightly-inappropriate
    // must stay named here — check-endpoint.mjs is a library CLI that exits 1
    // on a bare invocation with no args (always "fails" without checking
    // anything), check-dep-sync.mjs shells to unpinned `npx depcheck` per
    // workspace package (measured at 4m33s wall time for a single full run),
    // and check-deploy-sha.mjs requires --url/--expected-sha runtime args
    // from a real deploy event with no bare invocation (#5076/#5102 — it
    // failed every nightly run with a usage error before being added here).
    const excludedNames = [...excludedBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(excludedNames).toEqual(
      expect.arrayContaining(["check-endpoint", "check-dep-sync", "check-deploy-sha"])
    );
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

describe("nightly-compliance.yml File meta-improvement issue if drift detected step (#5084)", () => {
  const step = extractStep(WORKFLOW, "File meta-improvement issue if drift detected");

  // Regression test for the bug this issue reports: the dedupe key used to
  // be keyed on `today` alone, so a persistent failure filed a fresh issue
  // every single night instead of being recognised as the same bug.
  it("no longer dedupes on the date alone", () => {
    expect(step).not.toMatch(/--dedupe-key "nightly-compliance-drift-\$\{today\}"/);
    expect(step).not.toMatch(/--search-text "\$title"/);
  });

  it("computes a stable signature via the shared signature module, not inline date logic", () => {
    expect(step).toMatch(/node scripts\/print-drift-signature\.mjs/);
    expect(step).toMatch(/--dedupe-key "nightly-compliance-drift-\$\{signature\}"/);
    expect(step).toMatch(/--search-text "\$signature"/);
  });

  it("embeds the signature as a machine-readable HTML-comment marker in the issue body", () => {
    expect(step).toMatch(/<!-- nightly-compliance-signature: \$\{signature\} -->/);
  });

  it("comments on a matched open issue instead of silently skipping", () => {
    expect(step).toMatch(/--comment-body-file \/tmp\/drift-comment\.md/);
  });

  it("still keeps the date in the title for readability", () => {
    expect(step).toMatch(/title="\[nightly-compliance \$\{today\}\] Drift detected"/);
  });

  it("captures the filed/matched issue number as a step output for the completion sweep", () => {
    expect(step).toMatch(/echo "issue-number=\$\{issue_number\}" >> "\$GITHUB_OUTPUT"/);
  });
});

describe("nightly-compliance.yml Close superseded nightly-compliance issues step (#5454)", () => {
  const step = extractStep(WORKFLOW, "Close superseded nightly-compliance issues");

  // Regression test for the meta-issue this fixes: #5084 stopped duplicate
  // filing but nothing ever closed an OLDER superseded issue, so 8 near-
  // identical issues stayed open across 09-02 to 09-16.
  it("runs the sweep script, excluding this run's own filed/matched issue", () => {
    expect(step).toMatch(/node scripts\/sweep-nightly-compliance\.mjs/);
    expect(step).toMatch(/--exclude-issue "\$\{\{ steps\.file-issue\.outputs\.issue-number \}\}"/);
  });

  it("links the sweep to the newest issue, not a silent close", () => {
    expect(step).toMatch(/--new-issue-url "\$new_issue_url"/);
  });

  it("only runs when drift was actually filed this run", () => {
    expect(step).toMatch(/steps\.drift\.outputs\.drift == 'true'/);
    expect(step).toMatch(/steps\.file-issue\.outputs\.issue-number != ''/);
  });
});
