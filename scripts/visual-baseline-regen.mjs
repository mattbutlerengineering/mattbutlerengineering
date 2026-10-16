#!/usr/bin/env node

/**
 * visual-baseline-regen.mjs — the pure planner behind the baseline-regen workflow.
 *
 * Every hand-run baseline regen repeated one recipe (see #6644). This module
 * owns the per-target paths, the Playwright argv, the PR labels and the PR
 * body, so the workflow restates none of them inline. Per-app paths come from
 * `appPaths()` in visual-noise-floor.mjs, never from a copy here. No `gh` or
 * `git` calls happen in this module — inputs are injected.
 *
 * Usage:
 *   node scripts/visual-baseline-regen.mjs plan --app <app> [--grep <re>]
 *     prints `$GITHUB_OUTPUT` lines
 *   git status --porcelain -- <dir> | node scripts/visual-baseline-regen.mjs summarize --app <app>
 *   node scripts/visual-baseline-regen.mjs body --app <app> --changes <json> \
 *     --provenance <json> --verify <json> --run-url <url>
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APPS, appPaths, PROVENANCE_FIELDS } from "./visual-noise-floor.mjs";

/** The regenerable suites. Apps derive from `appPaths()`; rialto is added alongside. */
export const TARGETS = Object.fromEntries(
  APPS.map((app) => {
    const { config, spec, screenshots, packageJson } = appPaths(app);
    return [app, { config, spec, screenshots, packageJson }];
  })
);

// The rialto Storybook suite is not an `apps/*` target; its webServer is
// `storybook dev`, so it needs no rialto build or vite build before capture.
TARGETS.rialto = {
  config: "packages/rialto/playwright.visual.config.ts",
  spec: "packages/rialto/src/test/visual/visual.spec.ts",
  screenshots: "packages/rialto/src/test/visual/__screenshots__",
  packageJson: "packages/rialto/package.json",
};

/** A baseline PR is a human decision: it only ever carries this label. */
const LABELS = ["needs-review"];

/**
 * @param {{ app: string, grep?: string }} input
 */
export function planBaselineRegen({ app, grep }) {
  const target = TARGETS[app];
  if (!target) {
    throw new Error(
      `unknown app ${JSON.stringify(app)} — expected one of ${Object.keys(TARGETS).join(", ")}`
    );
  }
  const verifyArgs = ["playwright", "test", "-c", target.config, target.spec];
  if (grep) verifyArgs.push("-g", grep);
  const captureArgs = [...verifyArgs, "--update-snapshots"];
  return {
    app,
    config: target.config,
    spec: target.spec,
    screenshots: target.screenshots,
    packageJson: target.packageJson,
    grep: grep ?? null,
    branch: `automation/visual-baseline-regen/${app}`,
    addPaths: `${target.screenshots}/*.png`,
    labels: [...LABELS],
    captureArgs,
    verifyArgs,
  };
}

/**
 * Parse `git status --porcelain -- <dir>` into sorted added/modified/deleted PNG paths under `dir`.
 */
export function summarizeSnapshotChanges(porcelainText, screenshotsDir) {
  const out = { added: [], modified: [], deleted: [] };
  const prefix = `${screenshotsDir.replace(/\/+$/, "")}/`;
  for (const line of porcelainText.split("\n")) {
    if (line.length < 4) continue;
    const code = line.slice(0, 2);
    const path = line.slice(3).trim();
    if (!path.startsWith(prefix) || !path.toLowerCase().endsWith(".png")) continue;
    if (code === "??") out.added.push(path);
    else if (code.includes("D")) out.deleted.push(path);
    else if (code.includes("M")) out.modified.push(path);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

/**
 * @param {{ plan: ReturnType<typeof planBaselineRegen>, changes: ReturnType<typeof summarizeSnapshotChanges>,
 *   provenance: Record<string,string>, verify: { passed: number, total: number }, runUrl: string }} input
 */
export function renderPrBody({ plan, changes, provenance, verify, runUrl }) {
  const rows = [
    ...changes.added.map((f) => `| added | \`${f}\` |`),
    ...changes.modified.map((f) => `| modified | \`${f}\` |`),
    ...changes.deleted.map((f) => `| deleted | \`${f}\` |`),
  ];
  const provRows = PROVENANCE_FIELDS.map((f) => `| ${f} | ${provenance[f] ?? "unknown"} |`);
  const grepArg = plan.grep ? ` -g ${JSON.stringify(plan.grep)}` : "";
  return [
    `## Regenerated \`${plan.app}\` visual baselines`,
    "",
    `Baselines under \`${plan.screenshots}\` were re-captured on the CI runner (run: ${runUrl}). ` +
      "Whether the new pixels are the intended look is a human decision, so this PR is labelled " +
      `\`${plan.labels.join("`, `")}\`.`,
    "",
    "### Provenance",
    "",
    "| field | value |",
    "| --- | --- |",
    ...provRows,
    "",
    "### Changed snapshots",
    "",
    "| change | file |",
    "| --- | --- |",
    ...rows,
    "",
    "### Verification",
    "",
    `${verify.passed}/${verify.total} snapshots pass in compare mode on the runner that produced them.`,
    "",
    "### How to review",
    "",
    "Open **Files changed** — GitHub renders each replaced PNG with 2-up / swipe / onion-skin views.",
    "",
    "### Reproduce locally",
    "",
    "```bash",
    `pnpm --dir ${plan.packageJson.replace(/\/package\.json$/, "")} exec playwright test -c ${plan.config.split("/").pop()} ${plan.spec.split("/").slice(-2).join("/")}${grepArg} --update-snapshots`,
    "```",
    "",
    "macOS-rendered baselines differ from Linux CI; only commit images produced on the runner.",
    "",
    "**Never auto-merge — a baseline PR merges only after a human has looked at the images.**",
    "",
  ].join("\n");
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const app = flag(args, "app");
  if (cmd === "plan") {
    const plan = planBaselineRegen({ app, grep: flag(args, "grep") });
    process.stdout.write(
      `config=${plan.config}\nspec=${plan.spec}\nscreenshots=${plan.screenshots}\n` +
        `package_json=${plan.packageJson}\nbranch=${plan.branch}\nadd_paths=${plan.addPaths}\n` +
        `capture_args=${JSON.stringify(plan.captureArgs)}\nverify_args=${JSON.stringify(plan.verifyArgs)}\n`
    );
  } else if (cmd === "summarize") {
    const plan = planBaselineRegen({ app });
    const text = readFileSync(0, "utf8");
    process.stdout.write(`${JSON.stringify(summarizeSnapshotChanges(text, plan.screenshots))}\n`);
  } else if (cmd === "body") {
    const plan = planBaselineRegen({ app, grep: flag(args, "grep") });
    process.stdout.write(
      renderPrBody({
        plan,
        changes: readJson(flag(args, "changes")),
        provenance: readJson(flag(args, "provenance")),
        verify: readJson(flag(args, "verify")),
        runUrl: flag(args, "run-url") ?? "",
      })
    );
  } else {
    throw new Error("usage: visual-baseline-regen.mjs <plan|summarize|body> --app <app> …");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
