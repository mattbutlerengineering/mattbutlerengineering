#!/usr/bin/env node

/**
 * Architecture fitness test: every external action a workflow `uses:` is
 * pinned to a full 40-character commit SHA (#9222).
 *
 * A tag or branch ref (`actions/checkout@v7`, `pnpm/action-setup@v3`) is
 * mutable: whoever controls the action's repo can move it, and the next run
 * executes the new code with this repo's secrets. A commit SHA cannot move.
 * Keep the human-readable version as a trailing comment:
 *
 *   uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 *
 * Out of scope: local actions (`./...`) and `docker://` images, which have no
 * git ref to pin.
 *
 * Usage: node scripts/check-action-pins.mjs
 * Exit code: 0 when every external action is SHA-pinned, 1 otherwise
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A `uses:` key, with an optional sequence dash and optional quotes around the value. */
const USES_LINE = /^\s*(?:-\s+)?uses:\s*["']?([^\s"'#]+)/;

const FULL_SHA = /^[0-9a-f]{40}$/;

/** Returns the unpinned `uses:` refs in one workflow file's content. */
export function checkWorkflow(name, content) {
  const errors = [];
  content.split("\n").forEach((text, index) => {
    const match = USES_LINE.exec(text);
    if (!match) return;
    const ref = match[1];
    if (ref.startsWith("./") || ref.startsWith("docker://")) return;
    const at = ref.lastIndexOf("@");
    const version = at === -1 ? "" : ref.slice(at + 1);
    if (!FULL_SHA.test(version)) {
      errors.push({
        line: index + 1,
        message: `\`${ref}\` is not pinned to a 40-character commit SHA`,
      });
    }
  });
  return { name, errors };
}

/** Scans every workflow in `<root>/.github/workflows`. */
export function findUnpinnedActions(root = DEFAULT_ROOT) {
  const workflowsDir = join(root, ".github", "workflows");
  if (!existsSync(workflowsDir)) return { results: [], findings: [] };

  const results = readdirSync(workflowsDir)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .sort()
    .map((file) => checkWorkflow(file, readFileSync(join(workflowsDir, file), "utf-8")));

  const findings = results.flatMap((result) =>
    result.errors.map((error) => ({ workflow: result.name, ...error }))
  );
  return { results, findings };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-action-pins.mjs");

if (isMain) {
  const { findings } = findUnpinnedActions();
  process.exit(
    runCheck({
      name: "external actions are SHA-pinned",
      findings,
      formatFinding: (finding) => `${finding.workflow}:${finding.line}: ${finding.message}`,
      passMessage: "PASS: Every external action in .github/workflows is pinned to a commit SHA.",
      failMessage:
        "FAIL: Some workflows use an action by a mutable tag or branch.\n" +
        "Pin each to the commit SHA of its tag and keep the version as a comment:\n" +
        "  uses: owner/action@<40-char sha> # vX.Y.Z",
    })
  );
}
