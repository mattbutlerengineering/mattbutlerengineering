#!/usr/bin/env node
/**
 * labels.mjs — the one declaration of the ui-quality issue labels
 * (docs/features/ui-quality-loop/architecture.md § Components "Labels").
 *
 * `findings.mjs` reads the names from here; Ship runs the printed
 * `gh label create` lines once, before the routine's first fire (the
 * sandbox's MCP surface has no label API). Printing never executes anything.
 *
 * Usage: node scripts/ui-quality/labels.mjs print-bootstrap
 */

import { fileURLToPath } from "node:url";

export const LABELS = Object.freeze([
  Object.freeze({
    name: "ui-quality",
    color: "5319e7",
    description: "Found by the daily ui-quality routine",
  }),
  Object.freeze({
    name: "ui-quality:p1",
    color: "b60205",
    description: "ui-quality P1: fix within 7 days",
  }),
  Object.freeze({
    name: "ui-quality:p2",
    color: "fbca04",
    description: "ui-quality P2: filed within the per-fire budget",
  }),
]);

export const LABEL = Object.freeze({
  base: LABELS[0].name,
  p1: LABELS[1].name,
  p2: LABELS[2].name,
});

/** `--force` makes a re-run update the label in place instead of failing. */
export function bootstrapCommands(labels = LABELS) {
  return labels.map(
    (l) => `gh label create "${l.name}" --color ${l.color} --description "${l.description}" --force`
  );
}

const COMMANDS = {
  "print-bootstrap": (ctx) => {
    ctx.stdout(`${bootstrapCommands().join("\n")}\n`);
    return 0;
  },
};

/**
 * @param {string[]} argv
 * @param {object} [deps] stdout, stderr
 * @returns {number} exit code
 */
export function main(argv, deps = {}) {
  const ctx = {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    ...deps,
  };
  const command = COMMANDS[argv[0]];
  if (!command) {
    ctx.stderr(`Usage: labels.mjs <${Object.keys(COMMANDS).join("|")}>\n`);
    return 2;
  }
  return command(ctx);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
