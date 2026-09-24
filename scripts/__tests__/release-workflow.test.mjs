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
 * Round 3 (#5721 re-review): the pinned changesets/action is v2.1.2
 * (ae32849d), not v1 — verified directly against its real action.yml,
 * src/index.ts and src/run.ts (`gh api repos/changesets/action/contents/...`),
 * not from memory. v2 renames every input used here (`version`->
 * `version-script`, `publish`->`publish-script`, `commit`->`commit-message`,
 * `title`->`pr-title`) and its output is `pr-number`, not
 * `pullRequestNumber`. `throwOnRenamedInputs()` in the action's own
 * src/index.ts makes the old names a hard runtime failure, not a silent
 * no-op — so this file's assertions must track the real pinned version, and
 * a vendored snapshot of that version's real inputs/outputs (below) guards
 * against a future name drifting out of sync again.
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

// Vendored snapshot of changesets/action@ae32849d5ba541f9ae29e40e22a623bc13562f51
// (tagged v2.1.2)'s real action.yml `inputs:`/`outputs:` keys, fetched via
// `gh api repos/changesets/action/contents/action.yml?ref=ae32849d...` and
// cross-checked against src/index.ts's `throwOnRenamedInputs()` and its
// `core.setOutput(...)` calls. Keyed to the exact pinned SHA below: if the
// workflow's pin ever moves, this snapshot must be re-fetched and re-pinned
// too, not just copied forward.
const CHANGESETS_ACTION_SHA = "ae32849d5ba541f9ae29e40e22a623bc13562f51";
const CHANGESETS_ACTION_INPUTS = [
  "github-token",
  "publish-script",
  "version-script",
  "commit-message",
  "pr-title",
  "pr-draft",
  "pr-base-branch",
  "create-github-releases",
  "push-git-tags",
  "push-with-git-cli",
  "cwd",
];
const CHANGESETS_ACTION_OUTPUTS = [
  "published",
  "published-packages",
  "has-changesets",
  "pr-number",
];

/**
 * Extracts the top-level keys of a step's `with:` block, walking indentation
 * rather than slicing a fixed character window — a fixed-size slice can
 * silently include or truncate keys as the step grows. Assumes 2-space YAML
 * indentation, matching this repo's workflow style throughout.
 */
function extractWithKeys(workflow, usesMarker) {
  const lines = workflow.split("\n");
  const usesLineIdx = lines.findIndex((line) => line.includes(usesMarker));
  if (usesLineIdx === -1) return null;

  const usesIndent = lines[usesLineIdx].match(/^(\s*)/)[1].length;
  const withLineIdx = lines.findIndex(
    (line, i) =>
      i > usesLineIdx && line.trim() === "with:" && line.match(/^(\s*)/)[1].length === usesIndent
  );
  if (withLineIdx === -1) return null;
  const withIndent = lines[withLineIdx].match(/^(\s*)/)[1].length;

  const keys = [];
  for (let i = withLineIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= withIndent) break;
    if (indent !== withIndent + 2) continue;
    const match = line.match(/^\s*([a-zA-Z0-9_-]+):/);
    if (match) keys.push(match[1]);
  }
  return keys;
}

describe("release.yml pins changesets/action to a version whose real inputs/outputs it uses", () => {
  it("uses changesets/action, pinned by commit SHA like every other action in this repo", () => {
    expect(WORKFLOW).toMatch(/uses:\s*changesets\/action@[0-9a-f]{40}\s*#\s*v\d+\.\d+\.\d+/);
  });

  it("pins the exact SHA this test's vendored input/output snapshot was fetched from", () => {
    expect(WORKFLOW).toContain(`changesets/action@${CHANGESETS_ACTION_SHA}`);
  });

  it("only sets `with:` keys that are real inputs of the pinned changesets/action version", () => {
    const keys = extractWithKeys(WORKFLOW, "changesets/action@");
    expect(keys, "no with: block found under the changesets/action step").not.toBeNull();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(
        CHANGESETS_ACTION_INPUTS,
        `"${key}" is not a real input of the pinned action`
      ).toContain(key);
    }
  });

  it("uses the v2 input names, not the renamed v1 ones (version/publish/commit/title)", () => {
    const actionIdx = WORKFLOW.indexOf("changesets/action@");
    expect(actionIdx).toBeGreaterThan(-1);
    const block = WORKFLOW.slice(actionIdx, actionIdx + 2500);
    expect(block).toContain("version-script:");
    expect(block).toContain("publish-script:");
    expect(block).toContain("commit-message:");
    expect(block).toContain("pr-title:");
    // v1 names, renamed in v2 -- throwOnRenamedInputs() makes these a hard
    // runtime failure if present as with: keys (not merely a comment).
    expect(WORKFLOW).not.toMatch(/^\s+version:\s*\|/m);
    expect(WORKFLOW).not.toMatch(/^\s+publish:\s*pnpm/m);
    expect(WORKFLOW).not.toMatch(/^\s+commit:\s*["']/m);
    expect(WORKFLOW).not.toMatch(/^\s+title:\s*["']/m);
  });

  it("runs the version script through a checked-in file, not an inline multi-line block", () => {
    // @actions/exec tokenizes the version-script/publish-script command
    // STRING (argv splitting) rather than spawning a shell -- an inline
    // block with comments/$()/if-fi/redirects can't run that way. The logic
    // must live in a real file invoked via `bash <path>`.
    expect(WORKFLOW).toContain("version-script: bash scripts/release-version.sh");
    expect(WORKFLOW).toContain("publish-script: pnpm exec changeset publish");
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

  it("dispatches CI on the Version Packages PR branch, gated on the real v2 output name", () => {
    const dispatchIdx = WORKFLOW.indexOf("Dispatch CI on the Version Packages PR branch");
    expect(dispatchIdx, "no CI-dispatch step for the Version PR").toBeGreaterThan(-1);
    const block = WORKFLOW.slice(dispatchIdx, dispatchIdx + 1800);
    expect(CHANGESETS_ACTION_OUTPUTS).toContain("pr-number");
    expect(block).toContain("if: steps.changesets.outputs.pr-number");
    // v1 name, renamed in v2 -- not a real output of the pinned action.
    expect(block).not.toContain("pullRequestNumber");
    expect(block).toContain("gh workflow run ci.yml --ref changeset-release/main");
  });

  it("grants actions:write, required for the CI-dispatch step's workflow_dispatch call", () => {
    const permissionsIdx = WORKFLOW.indexOf("permissions:");
    const block = WORKFLOW.slice(permissionsIdx, permissionsIdx + 300);
    expect(block).toMatch(/actions:\s*write/);
  });
});
