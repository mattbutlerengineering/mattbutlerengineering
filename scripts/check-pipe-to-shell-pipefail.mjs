#!/usr/bin/env node

/**
 * Architecture fitness test: every workflow step that pipes a downloader into a
 * shell must set `pipefail` first.
 *
 * GitHub Actions runs a `run:` block under `/usr/bin/bash -e {0}` — `-e` only,
 * never `-o pipefail` (measured; see .claude/rules/gotchas.md § CI). A pipeline's
 * exit status is therefore its LAST command's, so in
 *
 *   curl -fsSL https://get.pulumi.com | sh -s -- --version 3.253.0
 *
 * a failed `curl` writes nothing, exits non-zero, and is ignored: `sh` reads an
 * empty script and exits 0. The step goes green having installed nothing, and
 * every later command silently resolves whatever binary the runner image ships.
 *
 * That is not hypothetical. The Pulumi pin those two lines implement exists
 * because a runner image bump took Pulumi 3.253.0 -> 3.256.0 on 2026-08-11 and
 * broke production infra deploys for hours with zero repo changes (#4117/#4118).
 * An unguarded pin reinstates exactly that outage while wearing a green check.
 *
 * `pulumi-preview.yml` already carried the `set -euo pipefail` fix. This check
 * generalises it instead of re-asserting it per file, so the production apply
 * path (`pulumi-up.yml`), both arms of `pulumi-r2-checksum-validation.yml`, and
 * any future install site cannot land unguarded.
 *
 * Scope note: only a downloader (`curl`/`wget`) piped into a shell is flagged.
 * That is the shape where a silent no-op is indistinguishable from success and
 * the blast radius is "wrong binary deploys production". Broader piped commands
 * are left to review.
 *
 * Shell note: no workflow in this repo declares a `shell:`, so every block runs
 * under the default `bash -e`. A step that later adopts `shell: bash -eo
 * pipefail` would be flagged here despite being safe — deliberately fail-closed:
 * a false red is cheap and visible, a false green is what this check exists to
 * prevent.
 *
 * Usage: node scripts/check-pipe-to-shell-pipefail.mjs
 * Exit code: 0 when every pipe-to-shell install is guarded, 1 otherwise
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A `run:` key line: indentation, an optional sequence dash, then the key. */
const RUN_KEY = /^(\s*(?:-\s+)?)run:\s*(.*)$/;

/** A YAML block-scalar indicator (`|`, `|-`, `>`, `>2+`, ...) — not content. */
const BLOCK_INDICATOR = /^[|>][-+]?\d*$/;

/**
 * A downloader piped into a shell. The sink is anchored immediately after a
 * pipe so `curl ... | jq .version` and `curl ... | grep -c sh` do not match,
 * while `curl ... | gunzip | bash` and `curl ... | /bin/sh` still do.
 */
const DOWNLOAD_PIPE_TO_SHELL =
  /\b(?:curl|wget)\b[^\n]*?\|\s*(?:sudo\s+)?(?:[\w./-]*\/)?(?:sh|bash|zsh|ksh|dash)\b/;

/** A `set` builtin that turns pipefail on (`set -o pipefail`, `set -euo pipefail`). */
const SETS_PIPEFAIL = /^\s*set\s+[^\n]*\bpipefail\b/;

/**
 * Every `run:` block in a workflow, as `{ line, body }`.
 *
 * `line` is the 1-indexed line the `run:` key sits on — the step's address, and
 * where a fix gets inserted. Blocks are parsed textually rather than with a YAML
 * library, matching the precedent in the sibling check-*.mjs scripts: nothing in
 * `scripts/` depends on a YAML parser, and a `run:` block is a plain scalar with
 * no anchors or flow mappings to get wrong.
 *
 * @param {string} content
 * @returns {{ line: number, body: string }[]}
 */
export function extractRunBlocks(content) {
  const lines = content.split("\n");
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(RUN_KEY);
    if (!match) continue;

    const [, prefix, inline] = match;
    const keyColumn = prefix.length;
    const bodyLines = BLOCK_INDICATOR.test(inline.trim()) || inline.trim() === "" ? [] : [inline];

    // The block runs until a line re-indents to the `run:` key's own column or
    // further left — i.e. the step's next key, or the next step.
    let end = i + 1;
    for (; end < lines.length; end++) {
      if (lines[end].trim() === "") continue;
      if (lines[end].match(/^\s*/)[0].length <= keyColumn) break;
      bodyLines.push(lines[end]);
    }

    blocks.push({ line: i + 1, body: bodyLines.join("\n") });
    i = end - 1;
  }

  return blocks;
}

/**
 * Pure check for a single workflow — returns findings, never logs or exits.
 *
 * A `pipefail` only protects the commands that run after it, so the guard must
 * appear above the pipeline in the same block. A `set -euo pipefail` in a
 * different step protects nothing here: each `run:` block is its own process.
 *
 * @param {string} name
 * @param {string} content
 * @returns {{ name: string, errors: { line: number, message: string }[] }}
 */
export function checkWorkflow(name, content) {
  const errors = [];

  for (const block of extractRunBlocks(content)) {
    const bodyLines = block.body.split("\n");
    const pipefailAt = bodyLines.findIndex((line) => SETS_PIPEFAIL.test(line));

    bodyLines.forEach((line, index) => {
      if (!DOWNLOAD_PIPE_TO_SHELL.test(line)) return;
      if (pipefailAt !== -1 && pipefailAt < index) return;

      errors.push({
        line: block.line,
        message:
          `pipes a downloader into a shell without pipefail: \`${line.trim()}\` — ` +
          "a failed download exits 0 through the pipe, so the step goes green with " +
          "nothing installed; add `set -euo pipefail` as the first line of the block",
      });
    });
  }

  return { name, errors };
}

/** Scans every workflow in `<root>/.github/workflows`. */
export function findPipeToShellFindings(root = DEFAULT_ROOT) {
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

const isMain = process.argv[1] && process.argv[1].endsWith("check-pipe-to-shell-pipefail.mjs");

if (isMain) {
  const { findings } = findPipeToShellFindings();

  const exitCode = runCheck({
    name: "pipe-to-shell installs set pipefail",
    findings,
    formatFinding: (finding) => `${finding.workflow}:${finding.line}: ${finding.message}`,
    passMessage: "PASS: Every pipe-to-shell install in .github/workflows sets pipefail.",
    failMessage:
      "FAIL: Some workflow steps pipe a downloader into a shell without pipefail.\n" +
      "GitHub runs `run:` blocks under `bash -e` with no pipefail, so a failed\n" +
      "download exits 0 through the pipe and the step goes green having installed\n" +
      "nothing — later commands then resolve the runner image's own binary.\n" +
      "See .github/workflows/pulumi-preview.yml for the expected pattern.",
  });
  process.exit(exitCode);
}
