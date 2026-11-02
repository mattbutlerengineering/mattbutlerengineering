/**
 * Guards for the rialto Storybook browser-test gate (#8088).
 *
 * Two layers. `evaluateStorybookReport` is the verdict logic: any story failure
 * that is not on the explicit quarantine list fails the gate, and so does a
 * quarantined story that starts passing (or vanishes), so the list cannot rot.
 * The workflow half pins the CI wiring text-level, like the other *-workflow
 * tests here: the job exists, installs Chromium, runs the gate script, and the
 * workflow is not silenced with `continue-on-error`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateStorybookReport,
  findUnrunSuites,
  REQUIRED_STORY_FILES,
  summarizeVitestJson,
} from "../storybook-test-gate.mjs";
import UnhandledErrorsReporter from "../lib/storybook-gate-reporter.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const OVERLAYS = "src/components/Dialog/Dialog.overlays.stories.tsx";

function result(file, title, status) {
  return { file, title, status };
}

const baseline = [
  result(OVERLAYS, "Combobox In Dialog", "passed"),
  result("src/components/Tag/Tag.stories.tsx", "Default", "passed"),
];

const quarantine = [
  {
    file: "src/components/ImageUpload/ImageUpload.stories.tsx",
    story: "Default",
    reason: "axe label-content-name-mismatch",
    issue: 1,
  },
];

describe("evaluateStorybookReport", () => {
  it("passes when everything passes and the quarantined story still fails", () => {
    const verdict = evaluateStorybookReport(
      [...baseline, result(quarantine[0].file, "Default", "failed")],
      quarantine
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.problems).toEqual([]);
  });

  it("fails on a new, unquarantined story failure", () => {
    const verdict = evaluateStorybookReport(
      [
        ...baseline,
        result("src/components/Tag/Tag.stories.tsx", "Dismissible", "failed"),
        result(quarantine[0].file, "Default", "failed"),
      ],
      quarantine
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain("Tag.stories.tsx > Dismissible");
  });

  it("fails when a quarantined story starts passing, so the list is pruned", () => {
    const verdict = evaluateStorybookReport(
      [...baseline, result(quarantine[0].file, "Default", "passed")],
      quarantine
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain("now passes");
  });

  it("fails when a quarantined story no longer exists", () => {
    const verdict = evaluateStorybookReport(baseline, quarantine);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain("not found");
  });

  it("fails when the Dialog overlay guard did not run", () => {
    const verdict = evaluateStorybookReport(
      [
        result("src/components/Tag/Tag.stories.tsx", "Default", "passed"),
        result(quarantine[0].file, "Default", "failed"),
      ],
      quarantine
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain(OVERLAYS);
  });

  it("fails an empty report", () => {
    expect(evaluateStorybookReport([], []).ok).toBe(false);
  });

  it("names the Dialog overlay stories as required", () => {
    expect(REQUIRED_STORY_FILES).toContain(OVERLAYS);
  });
});

describe("summarizeVitestJson", () => {
  it("flattens vitest's json reporter into repo-relative file/title/status rows", () => {
    const rows = summarizeVitestJson({
      testResults: [
        {
          name: "/work/repo/packages/rialto/src/components/Tag/Tag.stories.tsx",
          assertionResults: [{ title: "Default", status: "passed" }],
        },
      ],
    });
    expect(rows).toEqual([result("src/components/Tag/Tag.stories.tsx", "Default", "passed")]);
  });
});

const FIXTURES = resolve(__dirname, "fixtures/storybook-gate");
const realQuarantine = JSON.parse(
  readFileSync(resolve(ROOT, "packages/rialto/storybook-quarantine.json"), "utf8")
);
const fixture = (name) => JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));

/** The verdict the gate reaches for a real vitest json report. */
function verdictFor(report, extras = {}) {
  return evaluateStorybookReport(summarizeVitestJson(report), realQuarantine, {
    unrunSuites: findUnrunSuites(report),
    ...extras,
  });
}

// Fixtures are trimmed real vitest json reports, produced by mutating a story
// file in a clone: a module-level throw in Tag.stories.tsx, and a play function
// that navigates window.top and kills the runner.
describe("gate fails closed on runs that look green", () => {
  it("fails when a story file does not collect (module-level throw)", () => {
    const report = fixture("report-throw-toplevel.json");
    const tag = report.testResults.find((s) => s.name.endsWith("Tag/Tag.stories.tsx"));
    expect(tag.status).toBe("failed");
    expect(tag.assertionResults).toEqual([]);
    const verdict = verdictFor(report);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain("src/components/Tag/Tag.stories.tsx");
  });

  it("fails when a story never ran to completion (runner killed, row pending)", () => {
    const report = fixture("report-kill.json");
    const rows = summarizeVitestJson(report);
    expect(rows.find((r) => r.title === "Kills").status).toBe("pending");
    const verdict = verdictFor(report);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain("ZReview.stories.tsx > Kills");
  });

  it("fails on an unhandled error even when every story row looks fine", () => {
    const verdict = verdictFor(fixture("report-throw-toplevel.json"), {
      unrunSuites: [],
      unhandledErrors: [{ name: "Error", message: "review-unhandled" }],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain("review-unhandled");
  });

  it("fails when vitest did not report a clean finish", () => {
    const verdict = verdictFor(fixture("report-throw-toplevel.json"), {
      unrunSuites: [],
      reason: "interrupted",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain("interrupted");
  });
});

describe("storybook-gate-reporter", () => {
  it("writes the unhandled errors and the run reason where the gate reads them", () => {
    const file = join(mkdtempSync(join(tmpdir(), "gate-reporter-")), "run.json");
    process.env.STORYBOOK_GATE_RUN_FILE = file;
    try {
      new UnhandledErrorsReporter().onTestRunEnd(
        [],
        [{ name: "Error", message: "boom", stack: "x" }],
        "passed"
      );
    } finally {
      delete process.env.STORYBOOK_GATE_RUN_FILE;
    }
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      reason: "passed",
      unhandledErrors: [{ name: "Error", message: "boom" }],
    });
  });
});

describe("turbo cache inputs", () => {
  it("hash the quarantine file the scripts suite reads, for test and test:coverage", () => {
    const turbo = JSON.parse(readFileSync(resolve(ROOT, "scripts/turbo.json"), "utf8"));
    for (const task of ["test", "test:coverage"]) {
      expect(turbo.tasks[task].inputs).toContain(
        "$TURBO_ROOT$/packages/rialto/storybook-quarantine.json"
      );
    }
  });
});

describe("quarantine list", () => {
  const list = JSON.parse(readFileSync(resolve(ROOT, "packages/rialto/storybook-quarantine.json")));

  it("names every entry by file and story, with a reason and a tracking issue", () => {
    for (const entry of list) {
      expect(entry.file).toMatch(/^src\/.*\.stories\.tsx$/);
      expect(entry.story.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(10);
      expect(Number.isInteger(entry.issue)).toBe(true);
    }
  });
});

describe("rialto-visual.yml — storybook-tests job", () => {
  const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/rialto-visual.yml"), "utf8");
  const match = WORKFLOW.match(/^ {2}storybook-tests:\n([\s\S]*?)(?=^ {2}[\w-]+:\n|(?![\s\S]))/m);

  it("defines the job", () => {
    expect(match, "job storybook-tests is missing").not.toBeNull();
  });

  const block = match?.[1] ?? "";

  it("installs Chromium and runs the gate script, not bare test:storybook", () => {
    expect(block).toContain("playwright install --with-deps chromium");
    expect(block).toContain("node scripts/storybook-test-gate.mjs");
  });

  it("is never silenced with continue-on-error", () => {
    expect(WORKFLOW).not.toContain("continue-on-error");
  });

  it("triggers on the files that define the suite, on PRs and main", () => {
    const triggers = WORKFLOW.slice(0, WORKFLOW.indexOf("\npermissions:"));
    for (const path of [
      "packages/rialto/vitest.config.storybook.ts",
      "packages/rialto/storybook-quarantine.json",
      "packages/rialto/package.json",
      "pnpm-lock.yaml",
      ".github/workflows/rialto-visual.yml",
      "scripts/storybook-test-gate.mjs",
      "scripts/lib/storybook-gate-reporter.mjs",
    ]) {
      expect(triggers.split(path).length - 1, `${path} in push+pull_request paths`).toBe(2);
    }
  });

  it("stays advisory: not a CI Gate dependency", () => {
    const ci = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(ci).not.toContain("storybook-tests");
  });
});
