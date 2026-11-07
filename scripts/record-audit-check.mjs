#!/usr/bin/env node

/**
 * Persists one real audit-check result into `.audit-state/inventory.json`.
 *
 * This is the missing caller closing #4899: `updateSurfaceScore()` and
 * `saveInventory()` (packages/agent-core/src/audit-{regression-detector,
 * inventory-store}.ts) were fully implemented and unit-tested but had zero
 * real callers anywhere in the automation surface, so `.audit-state/inventory.json`
 * only ever got overwritten from scratch by `generate-audit-inventory.mjs`
 * (fresh null/0/[] fields, never merging in prior results) — `findStalestZone()`
 * and the 3+-degrading detector in `audit-regression-detector.ts` never had
 * real data to work with.
 *
 * `.claude/skills/site-audit/SKILL.md` Mode 1 step 4 / Mode 2 step 4 shell
 * out to this script after each live Lighthouse/curl check.
 *
 * Requires packages/agent-core to be built first (`pnpm --filter @mbe/agent-core build`),
 * since @mbe/agent-core's package.json exports resolve to its compiled dist output.
 *
 * Usage:
 *   node scripts/record-audit-check.mjs --surface <id> \
 *     --performance <0-1> --accessibility <0-1> --best-practices <0-1> --seo <0-1>
 *   node scripts/record-audit-check.mjs --surface <id> --error "<message>"
 *   node scripts/record-audit-check.mjs --surface <id> --auth-gated "<method>" [scores...]
 *
 * `--error` and `--auth-gated` persist a lastOutcome so a failed or auth0-gated
 * surface still counts as checked (#8419) instead of keeping its zone at
 * "never checked" forever.
 */

import { loadInventory, saveInventory, recordSurfaceOutcome } from "@mbe/agent-core";

const SCORE_FLAGS = {
  "--performance": "performance",
  "--accessibility": "accessibility",
  "--best-practices": "bestPractices",
  "--seo": "seo",
};

const SCORE_KEYS = Object.values(SCORE_FLAGS);

/**
 * Parses CLI flags into `{ surface, scores, error }`. `scores` is `null`
 * unless at least one score flag was passed.
 *
 * @param {string[]} argv
 * @returns {{ surface: string | null, scores: Record<string, number> | null, error: string | null, authGated: string | null }}
 */
export function parseArgs(argv) {
  const args = { surface: null, scores: null, error: null, authGated: null };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];

    if (flag === "--surface") {
      args.surface = value;
      i += 1;
    } else if (flag === "--error") {
      args.error = value;
      i += 1;
    } else if (flag === "--auth-gated") {
      args.authGated = value;
      i += 1;
    } else if (flag in SCORE_FLAGS) {
      args.scores = { ...(args.scores ?? {}), [SCORE_FLAGS[flag]]: Number(value) };
      i += 1;
    }
  }

  return args;
}

/**
 * True when `scores` carries a finite number for every Lighthouse category.
 *
 * @param {Record<string, number> | null} scores
 * @returns {boolean}
 */
export function isCompleteScores(scores) {
  return (
    scores != null &&
    SCORE_KEYS.every((key) => typeof scores[key] === "number" && Number.isFinite(scores[key]))
  );
}

/**
 * Pure merge: record one check outcome on the matching surface via
 * `recordSurfaceOutcome()`, leave every other surface untouched.
 *
 * @param {import("@mbe/agent-core").AuditInventory} inventory
 * @param {string} surfaceId
 * @param {import("@mbe/agent-core").LighthouseScores | null} scores
 * @param {{ status?: import("@mbe/agent-core").CheckStatus, detail?: string | null }} [outcome]
 * @returns {{ inventory: import("@mbe/agent-core").AuditInventory, updated: boolean }}
 */
export function applyScoreUpdate(inventory, surfaceId, scores, outcome = {}) {
  const index = inventory.surfaces.findIndex((s) => s.id === surfaceId);
  if (index === -1) return { inventory, updated: false };

  const updatedSurface = recordSurfaceOutcome(
    inventory.surfaces[index],
    outcome.status ?? "scored",
    outcome.detail ?? null,
    scores
  );
  const surfaces = inventory.surfaces.map((s, i) => (i === index ? updatedSurface : s));

  return {
    inventory: { ...inventory, surfaces, lastUpdated: new Date().toISOString() },
    updated: true,
  };
}

/**
 * Maps parsed flags to a check outcome: `--auth-gated` wins over `--error`,
 * which wins over a plain scored check.
 *
 * @param {{ error: string | null, authGated: string | null }} args
 * @returns {{ status: import("@mbe/agent-core").CheckStatus, detail: string | null }}
 */
export function resolveOutcome(args) {
  if (args.authGated) return { status: "auth-gated", detail: args.authGated };
  if (args.error) return { status: "error", detail: args.error };
  return { status: "scored", detail: null };
}

/* c8 ignore start -- CLI entrypoint, exercised via unit tests on the pure functions above */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.surface) {
    console.error("FAIL: --surface <id> is required");
    process.exitCode = 1;
    return;
  }

  const scored = isCompleteScores(args.scores);
  if (!scored && !args.error && !args.authGated) {
    console.error(
      "FAIL: provide all four scores (--performance --accessibility --best-practices --seo), --auth-gated <method>, or --error <message>"
    );
    process.exitCode = 1;
    return;
  }

  const outcome = resolveOutcome(args);

  const repoRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  const inventory = await loadInventory(repoRoot);
  const { inventory: next, updated } = applyScoreUpdate(
    inventory,
    args.surface,
    scored ? args.scores : null,
    outcome
  );

  if (!updated) {
    console.error(`FAIL: no surface with id "${args.surface}" in inventory`);
    process.exitCode = 1;
    return;
  }

  await saveInventory(repoRoot, next);
  console.log(
    `Recorded ${args.surface} [${outcome.status}${outcome.detail ? `: ${outcome.detail}` : ""}]: ${JSON.stringify(scored ? args.scores : null)}`
  );
}

const isMain = process.argv[1] && process.argv[1].endsWith("record-audit-check.mjs");
if (isMain) {
  await main();
}
/* c8 ignore stop */
