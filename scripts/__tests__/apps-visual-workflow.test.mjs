/**
 * Shape guard for .github/workflows/apps-visual.yml — the VR floor for
 * marketing and hospitality (docs/features/ui-quality-loop breakdown M5).
 *
 * The properties pinned here are the ones whose absence nothing else would
 * notice: each spec named by full path (a glob fails silently — #3955), each
 * suite publishing to its OWN sticky comment, the Auth0 credential kept away
 * from Dependabot builds, `pipefail` on a piped gate, and the workflow staying
 * advisory rather than a CI Gate dependency.
 *
 * Text-level, like the other *-workflow tests here.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/apps-visual.yml"), "utf8");
const CI = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

const APPS = ["marketing", "hospitality"];

/** A top-level job's block, up to the next job key at two-space indent. */
function job(name) {
  const match = WORKFLOW.match(
    new RegExp(`^ {2}${name}:\\n([\\s\\S]*?)(?=^ {2}[\\w-]+:\\n|(?![\\s\\S]))`, "m")
  );
  expect(match, `job ${name} is missing`).not.toBeNull();
  return match[1];
}

describe.each(APPS)("apps-visual.yml — %s", (app) => {
  it("runs the visual spec by full path through the app's visual config", () => {
    const block = job(`${app}-visual`);
    expect(block).toContain(`apps/${app}/playwright.visual.config.ts`);
    expect(block).toContain(`apps/${app}/e2e/visual.spec.ts`);
  });

  it("builds rialto before the suite", () => {
    expect(job(`${app}-visual`)).toContain("pnpm build --filter @mattbutlerengineering/rialto");
  });

  it("uploads <app>-visual-diffs and <app>-visual-report", () => {
    const block = job(`${app}-visual`);
    expect(block).toContain(`name: ${app}-visual-diffs`);
    expect(block).toContain(`name: ${app}-visual-report`);
  });

  it("publishes to its own sticky comment with VISUAL_SUITE set to the app", () => {
    const block = job(`publish-${app}-visual-diffs`);
    expect(block).toMatch(new RegExp(`VISUAL_SUITE:\\s*${app}\\s*$`, "m"));
    expect(block).toContain(`name: ${app}-visual-diffs`);
    expect(block).toContain("node scripts/publish-visual-diffs.mjs");
    expect(block).toMatch(/declined=true/);
  });

  it("opens every multi-line run block with set -o pipefail", () => {
    // GitHub's default shell is `bash -e` without pipefail (gotchas § CI): a
    // gate piped into anything reports the pipe's status. Every block opens
    // with it, so a pipe added later is covered before anyone thinks of it.
    const bodies = [`${app}-visual`, `publish-${app}-visual-diffs`].flatMap((name) =>
      [...job(name).matchAll(/run: \|\n\s*(\S[^\n]*)/g)].map((m) => m[1])
    );
    expect(bodies.length).toBeGreaterThan(0);
    for (const first of bodies) expect(first).toBe("set -o pipefail");
  });
});

describe("apps-visual.yml — triggers and gating", () => {
  it("path-filters on each app and on packages/rialto/src/**", () => {
    for (const path of ["apps/marketing/**", "apps/hospitality/**", "packages/rialto/src/**"]) {
      expect(WORKFLOW).toContain(`"${path}"`);
    }
  });

  it("skips hospitality for Dependabot, which holds no E2E secrets", () => {
    expect(job("hospitality-visual")).toMatch(/github\.actor != 'dependabot\[bot\]'/);
  });

  it("hands hospitality the five E2E_* secrets", () => {
    const block = job("hospitality-visual");
    for (const name of [
      "E2E_AUTH0_DOMAIN",
      "E2E_AUTH0_CLIENT_ID",
      "E2E_AUTH0_AUDIENCE",
      "E2E_AUTH_EMAIL",
      "E2E_AUTH_PASSWORD",
    ]) {
      expect(block).toMatch(new RegExp(`${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`));
    }
  });

  it("stays advisory — no ci.yml job needs it", () => {
    expect(CI).not.toMatch(/apps-visual/);
  });
});
