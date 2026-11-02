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
  REQUIRED_STORY_FILES,
  summarizeVitestJson,
} from "../storybook-test-gate.mjs";

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
      "scripts/storybook-test-gate.mjs",
    ]) {
      expect(triggers.split(path).length - 1, `${path} in push+pull_request paths`).toBe(2);
    }
  });

  it("stays advisory: not a CI Gate dependency", () => {
    const ci = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(ci).not.toContain("storybook-tests");
  });
});
