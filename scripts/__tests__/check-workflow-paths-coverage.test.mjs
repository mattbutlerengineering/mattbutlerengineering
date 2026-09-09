/**
 * Tests for scripts/check-workflow-paths-coverage.mjs — the guard against
 * CI guards whose `paths:` filter does not cover the files their own jobs
 * exercise (docs/backlog.md seed, from maintenance:e2e-behind-edge-csp).
 *
 * The defect class: a workflow that runs `node scripts/guard.mjs` but whose
 * trigger filter lists only `apps/web/**` never runs when `scripts/guard.mjs`
 * changes — the guard looks present, has real assertions, and pins nothing.
 * Nothing goes red. Precedents: #3955 (six Playwright specs never invoked),
 * #3911 (245 tests outside every workspace test script).
 *
 * Soundness stance, mirrored from the module docblock: a reported gap means
 * "no push/pull_request event of this workflow can EVER fire on a change to
 * this exercised, git-tracked path". Pass direction is looser (any tracked
 * file under an exercised directory matching any pattern counts) — partial
 * directory coverage is a documented limit, not a finding.
 */

import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWLIST,
  githubPathPatternToRegExp,
  parseTriggerEvents,
  extractExercisedPaths,
  evaluateWorkflowCoverage,
  listTrackedFiles,
  discoverPackageDirs,
  runAudit,
} from "../check-workflow-paths-coverage.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("githubPathPatternToRegExp", () => {
  it("** crosses directory separators", () => {
    const re = githubPathPatternToRegExp("apps/rialto-web/**");
    expect(re.test("apps/rialto-web/e2e/csp.spec.ts")).toBe(true);
    expect(re.test("apps/marketing/index.html")).toBe(false);
  });

  it("leading ** matches at any depth (ci.yml's '**.md' shape)", () => {
    const re = githubPathPatternToRegExp("**.md");
    expect(re.test("README.md")).toBe(true);
    expect(re.test("docs/adr/0001-example.md")).toBe(true);
    expect(re.test("scripts/check-foo.mjs")).toBe(false);
  });

  it("single * does not cross directory separators", () => {
    const re = githubPathPatternToRegExp("*.png");
    expect(re.test("logo.png")).toBe(true);
    expect(re.test("docs/img/logo.png")).toBe(false);
  });

  it("a src-scoped pattern does not match package-root files", () => {
    const re = githubPathPatternToRegExp("packages/rialto/src/**");
    expect(re.test("packages/rialto/src/components/Button.tsx")).toBe(true);
    expect(re.test("packages/rialto/package.json")).toBe(false);
  });

  it("escapes regex metacharacters in literal segments", () => {
    const re = githubPathPatternToRegExp("apps/a+b/file.ts");
    expect(re.test("apps/a+b/file.ts")).toBe(true);
    expect(re.test("apps/aab/file.ts")).toBe(false);
  });
});

describe("parseTriggerEvents", () => {
  it("reads paths for push and pull_request, skipping comment lines in the list", () => {
    const wf = [
      "name: Fixture",
      "on:",
      "  push:",
      "    branches: [main]",
      "    paths:",
      '      - "apps/web/**"',
      "      # the guard's policy source lives in the worker",
      '      - "infrastructure/worker/**"',
      "  pull_request:",
      "    paths:",
      '      - "apps/web/**"',
      "jobs:",
      "  x:",
      "    steps: []",
    ].join("\n");
    expect(parseTriggerEvents(wf)).toEqual([
      {
        event: "push",
        filterType: "paths",
        patterns: ["apps/web/**", "infrastructure/worker/**"],
      },
      { event: "pull_request", filterType: "paths", patterns: ["apps/web/**"] },
    ]);
  });

  it("reads paths-ignore, and reports a filterless change event as unfiltered", () => {
    const wf = [
      "on:",
      "  push:",
      "    branches: [main]",
      "    paths-ignore:",
      '      - "**.md"',
      '      - "docs/**"',
      "  pull_request:",
      "    branches: [main]",
      "jobs: {}",
    ].join("\n");
    expect(parseTriggerEvents(wf)).toEqual([
      { event: "push", filterType: "paths-ignore", patterns: ["**.md", "docs/**"] },
      { event: "pull_request", filterType: null, patterns: [] },
    ]);
  });

  it("ignores a 'paths:' key inside an embedded run script (visual-noise-floor shape)", () => {
    const wf = [
      "on:",
      "  workflow_dispatch:",
      "jobs:",
      "  measure:",
      "    steps:",
      "      - name: embedded js",
      "        run: |",
      "          node -e '",
      '            paths: [path.dirname(require_.resolve("@playwright/test"))],',
      "          '",
    ].join("\n");
    expect(parseTriggerEvents(wf)).toEqual([]);
  });

  it("returns [] for workflows with no change-triggered events", () => {
    const wf = [
      "on:",
      "  schedule:",
      '    - cron: "0 15 * * 6"',
      "  workflow_dispatch:",
      "jobs: {}",
    ].join("\n");
    expect(parseTriggerEvents(wf)).toEqual([]);
  });
});

describe("extractExercisedPaths", () => {
  const trackedFiles = [
    "apps/web/src/main.ts",
    "apps/web/wrangler.toml",
    "packages/lib/src/index.ts",
    "packages/lib/package.json",
    "scripts/guard.mjs",
    "scripts/helper.mjs",
    "infrastructure/pulumi/index.ts",
    ".github/actions/setup-workspace/action.yml",
  ];
  const packageDirs = { "@x/web": "apps/web", "@x/lib": "packages/lib" };

  it("finds explicit tracked file paths in run blocks and skips comment lines", () => {
    const wf = [
      "on:",
      "  push:",
      "    paths:",
      '      - "apps/web/**"',
      "jobs:",
      "  guard:",
      "    steps:",
      "      - name: run guard",
      "        run: |",
      "          # see scripts/helper.mjs for background",
      "          node scripts/guard.mjs",
    ].join("\n");
    const exercised = extractExercisedPaths(wf, { trackedFiles, packageDirs });
    expect(exercised.map((e) => e.path)).toContain("scripts/guard.mjs");
    expect(exercised.map((e) => e.path)).not.toContain("scripts/helper.mjs");
  });

  it("drops untracked tokens, expression-bearing tokens, URLs, and .github/ paths", () => {
    const wf = [
      "on:",
      "  push:",
      "    paths:",
      '      - "apps/web/**"',
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: |",
      "          curl https://example.com/api/v1/health",
      "          cat apps/web/dist/bundle.js",
      "          echo ${{ github.workspace }}/visual-report/report.json",
      '          cp /tmp/users.log "$DIAG_DIR/users.log"',
      "          jq . .github/actions/setup-workspace/action.yml",
    ].join("\n");
    const exercised = extractExercisedPaths(wf, { trackedFiles, packageDirs });
    expect(exercised).toEqual([]);
  });

  it("maps --filter package names (with ... suffix) and --dir paths to package dirs", () => {
    const wf = [
      "on:",
      "  push:",
      "    paths:",
      '      - "apps/web/**"',
      "jobs:",
      "  x:",
      "    steps:",
      '      - run: pnpm build --filter "@x/lib..."',
      "      - run: pnpm --dir apps/web test:e2e",
      "      - run: pnpm build --filter=@x/unknown",
    ].join("\n");
    const paths = extractExercisedPaths(wf, { trackedFiles, packageDirs }).map((e) => e.path);
    expect(paths).toContain("packages/lib");
    expect(paths).toContain("apps/web");
    // unknown package names are silently dropped (sound under-approximation)
    expect(paths).toHaveLength(2);
  });

  it("captures working-directory values", () => {
    const wf = [
      "on:",
      "  push:",
      "    paths:",
      '      - "infrastructure/pulumi/**"',
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: pulumi up",
      "        working-directory: infrastructure/pulumi",
    ].join("\n");
    const paths = extractExercisedPaths(wf, { trackedFiles, packageDirs }).map((e) => e.path);
    expect(paths).toContain("infrastructure/pulumi");
  });
});

describe("evaluateWorkflowCoverage", () => {
  const trackedFiles = [
    "apps/web/src/main.ts",
    "packages/lib/src/index.ts",
    "packages/lib/package.json",
    "scripts/guard.mjs",
    "docs/notes.md",
  ];
  const packageDirs = { "@x/web": "apps/web", "@x/lib": "packages/lib" };

  const guardWorkflow = (paths) =>
    [
      "on:",
      "  push:",
      "    paths:",
      ...paths.map((p) => `      - "${p}"`),
      "jobs:",
      "  guard:",
      "    steps:",
      "      - run: node scripts/guard.mjs",
      "      - run: pnpm --dir apps/web test",
    ].join("\n");

  it("flags an exercised file no change event can ever fire on (the F1/CSP shape)", () => {
    const result = evaluateWorkflowCoverage({
      workflowText: guardWorkflow(["apps/web/**"]),
      trackedFiles,
      packageDirs,
    });
    expect(result.analyzable).toBe(true);
    expect(result.gaps.map((g) => g.path)).toEqual(["scripts/guard.mjs"]);
  });

  it("passes when the filter covers every exercised path", () => {
    const result = evaluateWorkflowCoverage({
      workflowText: guardWorkflow(["apps/web/**", "scripts/guard.mjs"]),
      trackedFiles,
      packageDirs,
    });
    expect(result.gaps).toEqual([]);
  });

  it("passes wholesale when any change event is unfiltered (ci.yml's pull_request)", () => {
    const wf = [
      "on:",
      "  push:",
      "    paths-ignore:",
      '      - "**.md"',
      "  pull_request:",
      "    branches: [main]",
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: node scripts/guard.mjs",
    ].join("\n");
    const result = evaluateWorkflowCoverage({ workflowText: wf, trackedFiles, packageDirs });
    expect(result.analyzable).toBe(false);
    expect(result.gaps).toEqual([]);
  });

  it("flags an exercised file fully inside a paths-ignore filter", () => {
    const wf = [
      "on:",
      "  push:",
      "    paths-ignore:",
      '      - "docs/**"',
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: node scripts/guard.mjs",
      "      - run: grep -q x docs/notes.md",
    ].join("\n");
    const result = evaluateWorkflowCoverage({ workflowText: wf, trackedFiles, packageDirs });
    // scripts/guard.mjs is NOT ignored, so it still triggers; docs/notes.md never can.
    expect(result.gaps.map((g) => g.path)).toEqual(["docs/notes.md"]);
  });

  it("treats a directory as covered when any tracked file under it matches a pattern", () => {
    // packages/lib exercised via --filter; filter covers only src/** — partial
    // coverage passes by design (documented limit).
    const wf = [
      "on:",
      "  push:",
      "    paths:",
      '      - "packages/lib/src/**"',
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: pnpm build --filter @x/lib",
    ].join("\n");
    const result = evaluateWorkflowCoverage({ workflowText: wf, trackedFiles, packageDirs });
    expect(result.gaps).toEqual([]);
  });

  it("declines to analyze negation patterns rather than mis-model them", () => {
    const wf = [
      "on:",
      "  push:",
      "    paths:",
      '      - "apps/**"',
      '      - "!apps/web/README.md"',
      "jobs:",
      "  x:",
      "    steps:",
      "      - run: node scripts/guard.mjs",
    ].join("\n");
    const result = evaluateWorkflowCoverage({ workflowText: wf, trackedFiles, packageDirs });
    expect(result.analyzable).toBe(false);
    expect(result.gaps).toEqual([]);
  });
});

describe("the real repo tree", () => {
  it("has no filtered workflow exercising a path its filter can never fire on", () => {
    const { findings, staleAllowlist } = runAudit({
      root: ROOT,
      trackedFiles: listTrackedFiles(ROOT),
      packageDirs: discoverPackageDirs(ROOT),
      allowlist: ALLOWLIST,
    });
    expect(
      findings.map((f) => `${f.workflow}: ${f.path}`),
      "Each finding is a file a workflow's own jobs exercise that its paths:/paths-ignore: " +
        "trigger filter can never fire on — the guard will not run when the guarded surface " +
        "changes. Add the path to the filter, or ALLOWLIST it with a reason."
    ).toEqual([]);
    expect(
      staleAllowlist,
      "ALLOWLIST entries that no longer correspond to a real gap must be removed."
    ).toEqual([]);
  });
});
