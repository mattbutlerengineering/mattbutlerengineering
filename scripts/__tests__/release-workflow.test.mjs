/**
 * Structural guard for .github/workflows/release.yml (#3322).
 *
 * History: the workflow originally pushed a version-bump commit directly to
 * `main` and published in the same job (#5713 fixed its GitHub Packages
 * auth). That direct-push flow was broken two ways found in #5721 review:
 * (1) `@mattbutlerengineering/rialto` had an invalid changesets dependency
 * tree (fixed separately, scripts/check-changeset-tree.mjs), and (2) even
 * once versioning worked, a bot-pushed commit to `main` can be rejected by
 * branch protection (CI Gate is a required check and `github-actions[bot]`
 * is not an admin) — publish ran BEFORE the push, so a rejected push would
 * have left GitHub Packages ahead of what `main`'s package.json records.
 *
 * Fix (Matt, 2026-09-24): switch to the standard changesets "Version PR"
 * flow via `changesets/action`. On a push to main with pending changesets,
 * it opens/updates a `changeset-release/main` PR that a human reviews and
 * merges — no direct push of a version commit to `main` at all. Once that
 * PR merges (no changesets left), the next run on main publishes instead.
 * This sidesteps the branch-protection question entirely: nothing but a
 * human-reviewed PR merge lands a version bump on `main`.
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

describe("release.yml uses the standard changesets Version PR flow", () => {
  it("uses changesets/action, pinned by commit SHA like every other action in this repo", () => {
    expect(WORKFLOW).toMatch(/uses:\s*changesets\/action@[0-9a-f]{40}\s*#\s*v\d+\.\d+\.\d+/);
  });

  it("passes version and publish commands to the action", () => {
    const actionIdx = WORKFLOW.indexOf("changesets/action@");
    expect(actionIdx).toBeGreaterThan(-1);
    const block = WORKFLOW.slice(actionIdx, actionIdx + 2500);
    expect(block).toMatch(/version:\s*\|/);
    expect(block).toContain("pnpm version-packages");
    expect(block).toContain("publish: pnpm exec changeset publish");
  });

  it("authenticates the action's GitHub API + publish calls with GITHUB_TOKEN", () => {
    const actionIdx = WORKFLOW.indexOf("changesets/action@");
    const block = WORKFLOW.slice(actionIdx, actionIdx + 2500);
    expect(block).toContain("GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
    expect(block).toContain("NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
  });

  it("has no direct git push of a version commit — the action opens a PR instead", () => {
    expect(WORKFLOW).not.toMatch(/git push/);
    expect(WORKFLOW).not.toContain("Commit version bump");
    expect(WORKFLOW).not.toContain("Configure git identity");
    expect(WORKFLOW).not.toContain("[skip ci]");
  });

  it("no longer hand-rolls a pending-changesets check — the action reports this itself", () => {
    expect(WORKFLOW).not.toContain("Check for pending changesets");
    expect(WORKFLOW).not.toContain("has_changesets");
  });

  it("grants contents:write and pull-requests:write for the action to open/update the PR", () => {
    const permissionsIdx = WORKFLOW.indexOf("permissions:");
    expect(permissionsIdx).toBeGreaterThan(-1);
    const block = WORKFLOW.slice(permissionsIdx, permissionsIdx + 300);
    expect(block).toMatch(/contents:\s*write/);
    expect(block).toMatch(/pull-requests:\s*write/);
    expect(block).toMatch(/packages:\s*write/);
  });

  it("points setup-node at npm.pkg.github.com, scoped to @mattbutlerengineering (#5713, unchanged)", () => {
    const setupNodeIdx = WORKFLOW.indexOf("actions/setup-node");
    expect(setupNodeIdx).toBeGreaterThan(-1);
    const block = WORKFLOW.slice(setupNodeIdx, setupNodeIdx + 300);
    expect(block).toContain("registry-url: https://npm.pkg.github.com");
    expect(block).toContain('scope: "@mattbutlerengineering"');
    expect(block).not.toContain("registry.npmjs.org");
  });

  it("has no leftover NPM_TOKEN references anywhere in the workflow", () => {
    expect(WORKFLOW).not.toMatch(/NPM_TOKEN/);
  });

  it("removes the missing-credential guard — GITHUB_TOKEN is never absent, so there is nothing left to detect", () => {
    expect(WORKFLOW).not.toMatch(/CREDENTIAL_GUARD/);
    expect(WORKFLOW).not.toMatch(/has_credential/);
    expect(WORKFLOW).not.toContain("Warn on missing publish credential");
  });

  it("builds rialto before the changesets/action step, so publish has dist/ available", () => {
    const buildIdx = WORKFLOW.indexOf("name: Build rialto");
    const actionIdx = WORKFLOW.indexOf("changesets/action@");
    expect(buildIdx).toBeGreaterThan(-1);
    expect(actionIdx).toBeGreaterThan(-1);
    expect(buildIdx).toBeLessThan(actionIdx);
    expect(WORKFLOW.slice(buildIdx, buildIdx + 600)).toContain(
      "pnpm --filter @mattbutlerengineering/rialto build"
    );
  });

  it("dispatches CI on the Version Packages PR branch, gated on the action having created/updated one", () => {
    const dispatchIdx = WORKFLOW.indexOf("Dispatch CI on the Version Packages PR branch");
    expect(dispatchIdx, "no CI-dispatch step for the Version PR").toBeGreaterThan(-1);
    const block = WORKFLOW.slice(dispatchIdx, dispatchIdx + 1500);
    expect(block).toContain("if: steps.changesets.outputs.pullRequestNumber");
    expect(block).toContain("gh workflow run ci.yml --ref changeset-release/main");
  });

  it("grants actions:write, required for the CI-dispatch step's workflow_dispatch call", () => {
    const permissionsIdx = WORKFLOW.indexOf("permissions:");
    const block = WORKFLOW.slice(permissionsIdx, permissionsIdx + 300);
    expect(block).toMatch(/actions:\s*write/);
  });
});
