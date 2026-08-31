import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyVisualToleranceChange } from "../check-visual-tolerance-change.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CI_WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

describe("classifyVisualToleranceChange", () => {
  it("fails when the enforced playwright config's tolerance changes with no baseline update", () => {
    const result = classifyVisualToleranceChange(["apps/rialto-web/playwright.config.ts"]);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/playwright\.config\.ts/);
  });

  it("passes when the same tolerance change also updates baseline snapshots", () => {
    const result = classifyVisualToleranceChange([
      "apps/rialto-web/playwright.config.ts",
      "apps/rialto-web/e2e/screenshots/hero-section-chromium-linux.png",
    ]);
    expect(result.pass).toBe(true);
  });

  it("passes when only baseline snapshots are updated (no tolerance surface touched)", () => {
    const result = classifyVisualToleranceChange([
      "apps/rialto-web/e2e/screenshots/hero-section-chromium-linux.png",
      "packages/rialto/src/test/visual/__screenshots__/button-primary-chromium-linux.png",
    ]);
    expect(result.pass).toBe(true);
  });

  it("passes on an unrelated diff that touches neither surface", () => {
    const result = classifyVisualToleranceChange([
      "packages/rialto/src/components/Button/Button.tsx",
      "docs/adr/ADR-030-example.md",
    ]);
    expect(result.pass).toBe(true);
  });

  it("passes on an empty diff", () => {
    const result = classifyVisualToleranceChange([]);
    expect(result.pass).toBe(true);
  });

  it("fails when the Storybook visual config's tolerance changes with no baseline update", () => {
    const result = classifyVisualToleranceChange(["packages/rialto/playwright.visual.config.ts"]);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/playwright\.visual\.config\.ts/);
  });

  it("fails when an e2e spec's threshold option changes with no baseline update", () => {
    const result = classifyVisualToleranceChange([
      {
        path: "apps/rialto-web/e2e/visual.spec.ts",
        patch: "-      maxDiffPixels: 674,\n+      maxDiffPixels: 50,\n",
      },
    ]);
    expect(result.pass).toBe(false);
  });

  it("passes when an e2e spec's threshold option changes AND baselines are updated", () => {
    const result = classifyVisualToleranceChange([
      {
        path: "apps/rialto-web/e2e/visual.spec.ts",
        patch: "-      maxDiffPixels: 674,\n+      maxDiffPixels: 50,\n",
      },
      "apps/rialto-web/e2e/screenshots/light-hero-chromium-linux.png",
    ]);
    expect(result.pass).toBe(true);
  });

  it("does not flag an ordinary e2e spec edit that never touches a threshold option", () => {
    // Avoids the false-positive that would block ~every e2e PR: only the
    // threshold-option keywords inside apps/rialto-web/e2e/** or
    // packages/rialto/** count, not any edit to those directories.
    const result = classifyVisualToleranceChange([
      {
        path: "apps/rialto-web/e2e/navigation.spec.ts",
        patch: "-  await page.click('a.old-selector');\n+  await page.getByRole('link').click();\n",
      },
    ]);
    expect(result.pass).toBe(true);
  });

  it("does not flag an ordinary rialto component edit with no threshold keywords", () => {
    const result = classifyVisualToleranceChange([
      {
        path: "packages/rialto/src/components/TapeChart/TapeChart.test.tsx",
        patch: "+  it('renders a deterministic UTC day header', () => {});\n",
      },
    ]);
    expect(result.pass).toBe(true);
  });

  // Regression test for #4711/#4496. #4496 ("fix(rialto-web): tighten
  // visual-regression tolerance to an absolute pixel budget") merged at
  // commit 4fc0b6adcc50905134448a168db6469e3f000a03 with `Visual Regression
  // (rialto-web)` red on its own head SHA. This is the VERIFIED actual
  // changed-file list from that commit (`git show --stat 4fc0b6ad`, recovered
  // from full repo history via `git fetch origin main --deepen`), not a
  // reconstruction: 4 files, no `*-snapshots/`/`screenshots/`/
  // `__screenshots__/` path among them, matching the issue's "+38/-1" size.
  it("fails on #4496's actual changed-file list (the regression this check exists to prevent)", () => {
    const pr4496ChangedFiles = [
      "apps/rialto-web/playwright.config.ts",
      "apps/rialto-web/src/pages/visual-test/DarkModeSection.tsx",
      "apps/rialto-web/src/pages/visual-test/TapeChartSections.tsx",
      "packages/rialto/src/components/TapeChart/TapeChart.test.tsx",
    ];
    const result = classifyVisualToleranceChange(pr4496ChangedFiles);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/playwright\.config\.ts/);
  });
});

describe("ci.yml wiring — visual-tolerance-check job (#4711)", () => {
  it("defines a job that runs check-visual-tolerance-change.mjs", () => {
    expect(CI_WORKFLOW).toContain("scripts/check-visual-tolerance-change.mjs");
  });

  it("CI Gate's needs: list depends on the visual-tolerance-check job", () => {
    const ciGateIndex = CI_WORKFLOW.indexOf("ci-gate:");
    expect(ciGateIndex).toBeGreaterThan(-1);
    const needsBlock = CI_WORKFLOW.slice(ciGateIndex, ciGateIndex + 700);
    expect(needsBlock).toMatch(/visual-tolerance-check/);
  });

  it("CI Gate's gate-check step fails the gate on a visual-tolerance-check failure", () => {
    const gateCheckIndex = CI_WORKFLOW.indexOf("- name: Check required job results");
    expect(gateCheckIndex).toBeGreaterThan(-1);
    const gateCheckBlock = CI_WORKFLOW.slice(gateCheckIndex, gateCheckIndex + 2500);
    expect(gateCheckBlock).toMatch(/visual-tolerance-check\.result/);
  });
});
