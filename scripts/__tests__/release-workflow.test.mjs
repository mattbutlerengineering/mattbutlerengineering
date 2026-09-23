/**
 * Structural guard for .github/workflows/release.yml (#3322).
 *
 * rialto is a GitHub Packages package (npm.pkg.github.com), not an npmjs one —
 * 14 versions already live there, confirmed private. `changeset publish`
 * needs an .npmrc authed for THAT registry, but the workflow configured
 * `actions/setup-node` for `registry.npmjs.org` and published with
 * `secrets.NPM_TOKEN`, a secret that has never been provisioned. A guard
 * added since detects the missing token and skips publish rather than
 * stranding a version bump — correct given the mismatch, but it papered
 * over the mismatch instead of fixing it, so the package sat frozen at
 * 0.2.0 while 34+ changesets stacked up (see the issue's 2026-09-20/22
 * comments).
 *
 * The fix: point setup-node's registry-url at GitHub Packages (matching
 * `packages/rialto/package.json`'s `publishConfig.registry`) and publish
 * with `secrets.GITHUB_TOKEN`, which every Actions run already has — no new
 * secret to provision. That also means the "is a credential configured"
 * guard has nothing left to detect (GITHUB_TOKEN is never absent), so it's
 * removed rather than repointed at a token that's always present; every
 * publish-adjacent step now gates on `has_changesets` alone.
 *
 * Text-level checks on the real workflow file, matching the house style
 * (docs-audit-workflow.test.mjs, metrics-collectors-workflow.test.mjs).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/release.yml");
const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");

describe("release.yml authenticates changeset publish to GitHub Packages", () => {
  it("points setup-node at npm.pkg.github.com, scoped to @mattbutlerengineering", () => {
    const setupNodeIdx = WORKFLOW.indexOf("actions/setup-node");
    expect(setupNodeIdx).toBeGreaterThan(-1);
    const block = WORKFLOW.slice(setupNodeIdx, setupNodeIdx + 300);
    expect(block).toContain("registry-url: https://npm.pkg.github.com");
    expect(block).toContain('scope: "@mattbutlerengineering"');
    expect(block).not.toContain("registry.npmjs.org");
  });

  it("grants the job packages: write, alongside the existing contents: write", () => {
    const permissionsIdx = WORKFLOW.indexOf("permissions:");
    expect(permissionsIdx).toBeGreaterThan(-1);
    const block = WORKFLOW.slice(permissionsIdx, permissionsIdx + 200);
    expect(block).toMatch(/contents:\s*write/);
    expect(block).toMatch(/packages:\s*write/);
  });

  it("publishes with GITHUB_TOKEN, not a never-provisioned NPM_TOKEN", () => {
    const publishIdx = WORKFLOW.indexOf("Publish to GitHub Packages");
    expect(publishIdx, "no publish step named for GitHub Packages").toBeGreaterThan(-1);
    const block = WORKFLOW.slice(publishIdx, publishIdx + 400);
    expect(block).toContain("NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
    expect(block).toContain("changeset publish");
    expect(block).not.toContain("secrets.NPM_TOKEN");
  });

  it("has no leftover NPM_TOKEN references anywhere in the workflow", () => {
    expect(WORKFLOW).not.toMatch(/NPM_TOKEN/);
  });

  it("removes the missing-credential guard — GITHUB_TOKEN is never absent, so there is nothing left to detect", () => {
    expect(WORKFLOW).not.toMatch(/CREDENTIAL_GUARD/);
    expect(WORKFLOW).not.toMatch(/has_credential/);
    expect(WORKFLOW).not.toContain("Warn on missing publish credential");
  });

  it("gates version/build/commit/publish/push steps on has_changesets alone", () => {
    const gatedSteps = [
      "Configure git identity",
      "Version packages",
      "Build rialto",
      "Commit version bump",
      "Publish to GitHub Packages",
      "Push version commit and release tags",
    ];
    for (const stepName of gatedSteps) {
      const idx = WORKFLOW.indexOf(`name: ${stepName}`);
      expect(idx, `step "${stepName}" not found`).toBeGreaterThan(-1);
      const nextLines = WORKFLOW.slice(idx, idx + 400);
      expect(nextLines).toMatch(/if: steps\.changesets\.outputs\.has_changesets == 'true'\n/);
    }
  });

  it("checks for pending changesets before gating any release step", () => {
    const idx = WORKFLOW.indexOf("Check for pending changesets");
    expect(idx).toBeGreaterThan(-1);
    expect(WORKFLOW.slice(idx, idx + 400)).toContain("has_changesets");
  });
});
