#!/usr/bin/env node

/**
 * Architecture fitness test: every Pulumi CLI install site must assert the
 * installed binary is actually the version it asked for.
 *
 * Follow-up to check-pipe-to-shell-pipefail.mjs (#5764), which closed the
 * TOTAL-FAILURE case: a failed `curl` now reds the step instead of exiting 0
 * through the pipe. It does not close the WRONG-VERSION case — if
 * `get.pulumi.com` succeeds but installs something other than the requested
 * version (a redirect, a changed installer contract, a yanked release, a
 * partially-populated `$HOME/.pulumi/bin`), every step stays green and the
 * workflow proceeds on a Pulumi nobody verified.
 *
 * That matters twice over: `pulumi-up.yml` is the production apply path, and
 * `pulumi-r2-checksum-validation.yml` exists to produce a citable verdict
 * about a *specific* version — a verdict attributed to the wrong version
 * (because the arm silently ran a different one than `inputs.pulumi_version`
 * asked for) is worse than no verdict at all.
 *
 * This check requires, for every `run:` block that installs Pulumi via
 * `curl … get.pulumi.com | sh`:
 *   1. the block adds the install dir to `$GITHUB_PATH` (the existing
 *      pattern every install site already follows);
 *   2. AFTER that line, the block queries the version by the binary's
 *      explicit path (`"$HOME/.pulumi/bin/pulumi" version`) — never bare
 *      `pulumi`, which `GITHUB_PATH` has not affected yet within the same
 *      step and would silently resolve the runner image's own binary,
 *      proving nothing;
 *   3. the block can fail the step (`exit 1`) on a mismatch.
 *
 * Generalised over install sites (not hardcoded to today's four) so a fifth
 * site cannot land unverified, the same way check-pipe-to-shell-pipefail.mjs
 * generalises the pipefail requirement.
 *
 * Usage: node scripts/check-pulumi-version-assertion.mjs
 * Exit code: 0 when every Pulumi install site asserts its version, 1 otherwise
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";
import { extractRunBlocks } from "./check-pipe-to-shell-pipefail.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A Pulumi CLI install via the documented `curl | sh` installer. */
const PULUMI_INSTALL_LINE = /\bcurl\b[^\n]*\bget\.pulumi\.com\b[^\n]*\|\s*(?:sudo\s+)?sh\b/;

/** The line every install site already has: adding the install dir to PATH. */
const GITHUB_PATH_LINE = /\$HOME\/\.pulumi\/bin"?\s*>>\s*"?\$GITHUB_PATH/;

/**
 * Querying the version off the binary's explicit path. `GITHUB_PATH` only
 * affects steps *after* the one that writes it, so a bare `pulumi version`
 * inside the same step would resolve the runner image's own binary and the
 * check would pass while proving nothing — the exact failure mode this
 * assertion exists to catch.
 */
const EXPLICIT_BINARY_VERSION_CALL = /"\$HOME\/\.pulumi\/bin\/pulumi"\s+version\b/;

/** Failing the step on a mismatch, rather than only logging one. */
const FAILS_ON_MISMATCH = /\bexit\s+1\b/;

/**
 * Pure check for a single workflow — returns findings, never logs or exits.
 *
 * @param {string} name
 * @param {string} content
 * @returns {{ name: string, errors: { line: number, message: string }[] }}
 */
export function checkWorkflow(name, content) {
  const errors = [];

  for (const block of extractRunBlocks(content)) {
    if (!PULUMI_INSTALL_LINE.test(block.body)) continue;

    const bodyLines = block.body.split("\n");
    const pathLineAt = bodyLines.findIndex((line) => GITHUB_PATH_LINE.test(line));

    if (pathLineAt === -1) {
      errors.push({
        line: block.line,
        message:
          "installs the Pulumi CLI but never adds it to $GITHUB_PATH — expected the " +
          '`echo "$HOME/.pulumi/bin" >> "$GITHUB_PATH"` line this check anchors the assertion after',
      });
      continue;
    }

    const after = bodyLines.slice(pathLineAt + 1).join("\n");
    const assertsVersion = EXPLICIT_BINARY_VERSION_CALL.test(after);
    const failsOnMismatch = FAILS_ON_MISMATCH.test(after);

    if (!assertsVersion || !failsOnMismatch) {
      errors.push({
        line: block.line,
        message:
          "installs the Pulumi CLI without asserting the installed version afterward — " +
          "a redirect, a yanked release, or a partially-populated install directory would leave " +
          "every later step silently running the wrong Pulumi; add, after the $GITHUB_PATH line, " +
          'a check that invokes "$HOME/.pulumi/bin/pulumi" version explicitly (not bare `pulumi` ' +
          "— GITHUB_PATH has not taken effect yet within this same step) and `exit 1`s on a mismatch",
      });
    }
  }

  return { name, errors };
}

/** Scans every workflow in `<root>/.github/workflows`. */
export function findVersionAssertionFindings(root = DEFAULT_ROOT) {
  const workflowsDir = join(root, ".github", "workflows");

  if (!existsSync(workflowsDir)) {
    return { results: [], findings: [] };
  }

  const results = readdirSync(workflowsDir)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .sort()
    .map((file) => checkWorkflow(file, readFileSync(join(workflowsDir, file), "utf-8")));

  const findings = results.flatMap((result) =>
    result.errors.map((error) => ({
      workflow: result.name,
      line: error.line,
      message: error.message,
    }))
  );

  return { results, findings };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-pulumi-version-assertion.mjs");

if (isMain) {
  const { findings } = findVersionAssertionFindings();

  const exitCode = runCheck({
    name: "Pulumi CLI installs assert their version",
    findings,
    formatFinding: (finding) => `${finding.workflow}:${finding.line}: ${finding.message}`,
    passMessage: "PASS: Every Pulumi CLI install in .github/workflows asserts its version.",
    failMessage:
      "FAIL: Some Pulumi CLI installs never verify what actually got installed.\n" +
      "A successful download that installs the wrong version (redirect, yanked release,\n" +
      "partial install) would leave every later step silently running the wrong Pulumi.\n" +
      "See .github/workflows/pulumi-up.yml for the expected pattern.",
  });
  process.exit(exitCode);
}
