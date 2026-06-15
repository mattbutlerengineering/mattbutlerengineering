#!/usr/bin/env node
/**
 * regen-manifest.mjs — Manifest of all committed generated artifacts.
 *
 * Each entry describes one "artifact family":
 *   - id:        short machine-readable key
 *   - label:     human description used in output messages
 *   - command:   the shell command (run from repo root) that regenerates the artifact
 *   - outputs:   file paths (relative to repo root) checked by `git diff --quiet` to detect staleness
 *
 * Usage:
 *   node scripts/regen-manifest.mjs            # regenerate all families
 *   node scripts/regen-manifest.mjs --check    # exit non-zero if any artifact is stale
 *
 * Adding a 6th family:
 *   Append one more object to the FAMILIES array below following the same shape.
 *   No other code changes required.
 *
 * @module regen-manifest
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a shell command from the repo root, inheriting stdio (for --check mode
 *  this is suppressed and we check the exit code manually). */
function run(cmd, { silent = false } = {}) {
  execSync(cmd, {
    cwd: ROOT,
    stdio: silent ? "pipe" : "inherit",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

/** Returns true when all listed paths are unmodified vs. the index. */
function isClean(paths) {
  try {
    run(`git diff --quiet -- ${paths.map((p) => JSON.stringify(p)).join(" ")}`, { silent: true });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Manifest — add new families here
// ---------------------------------------------------------------------------

/** @type {Array<{id: string, label: string, command: string, outputs: string[]}>} */
export const FAMILIES = [
  {
    id: "llms-txt",
    label: "llms.txt context files",
    // regen.mjs special-cases this family: it loops `mbe pack <pkg>` across
    // every known package (see regenLlms in regen.mjs). There is no single
    // CLI command that regenerates all llms.txt files, so the remediation
    // hint below points at `pnpm regen` — the canonical, always-runnable way
    // to bring every artifact (including this family) back in sync.
    command: "pnpm regen",
    outputs: [
      "llms.txt",
      "llms-full.txt",
      "apps/gen/llms.txt",
      "apps/gen/llms-full.txt",
      "apps/hospitality/llms.txt",
      "apps/hospitality/llms-full.txt",
      "apps/marketing/llms.txt",
      "apps/marketing/llms-full.txt",
      "apps/rialto-web/llms.txt",
      "apps/rialto-web/llms-full.txt",
      "packages/agent-core/llms.txt",
      "packages/agent-core/llms-full.txt",
      "packages/agent-test-utils/llms.txt",
      "packages/agent-test-utils/llms-full.txt",
      "packages/api-client/llms.txt",
      "packages/api-client/llms-full.txt",
      "packages/auth/llms.txt",
      "packages/auth/llms-full.txt",
      "packages/database/llms.txt",
      "packages/database/llms-full.txt",
      "packages/jobs/llms.txt",
      "packages/jobs/llms-full.txt",
      "packages/mcp-server/llms.txt",
      "packages/mcp-server/llms-full.txt",
      "packages/notifications/llms.txt",
      "packages/notifications/llms-full.txt",
      "packages/observability/llms.txt",
      "packages/observability/llms-full.txt",
      "packages/rialto/llms.txt",
      "packages/rialto/llms-full.txt",
      "packages/rialto-catalog/llms.txt",
      "packages/rialto-catalog/llms-full.txt",
      "packages/sentry/llms.txt",
      "packages/sentry/llms-full.txt",
      "packages/service-bootstrap/llms.txt",
      "packages/service-bootstrap/llms-full.txt",
      "packages/types/llms.txt",
      "packages/types/llms-full.txt",
      "services/agent/llms.txt",
      "services/agent/llms-full.txt",
      "services/reservations/llms.txt",
      "services/reservations/llms-full.txt",
      "services/users/llms.txt",
      "services/users/llms-full.txt",
    ],
  },
  {
    id: "rialto-registry",
    label: "packages/rialto/registry.json",
    command: "pnpm --filter @mattbutlerengineering/rialto build:registry",
    outputs: ["packages/rialto/registry.json"],
  },
  {
    id: "rialto-catalog-schemas",
    label: "packages/rialto-catalog/src/generated-schemas.ts",
    command: "pnpm --filter @mbe/rialto-catalog generate",
    outputs: ["packages/rialto-catalog/src/generated-schemas.ts"],
  },
  {
    id: "dep-graph-md",
    label: "docs/architecture/dependency-graph.md",
    command: "pnpm graph",
    outputs: ["docs/architecture/dependency-graph.md"],
  },
  {
    id: "dep-graph-json",
    label: "infrastructure/worker/dep-graph.json",
    command: "pnpm generate:dep-graph",
    outputs: ["infrastructure/worker/dep-graph.json"],
  },
];

// ---------------------------------------------------------------------------
// llms.txt packages — derived from the manifest outputs list
// ---------------------------------------------------------------------------

/** All workspace directories that carry an llms.txt (relative to root). */
export function llmsPackages() {
  return FAMILIES.find((f) => f.id === "llms-txt")
    .outputs.filter((o) => o === "llms.txt" || o.endsWith("/llms.txt"))
    .map((o) => (o === "llms.txt" ? "." : o.replace(/\/llms\.txt$/, "")));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const checkMode = process.argv.includes("--check");

  if (checkMode) {
    const stale = FAMILIES.filter((f) => !isClean(f.outputs));
    if (stale.length === 0) {
      console.log("All generated artifacts are up to date.");
      process.exit(0);
    }
    console.error(`Stale artifacts detected (${stale.length}):\n`);
    for (const f of stale) {
      console.error(`  [${f.id}]  ${f.label}`);
      console.error(`          fix: ${f.command}\n`);
    }
    process.exit(1);
  } else {
    // Delegate to regen.mjs which handles the llms.txt family individually
    run(`node ${JSON.stringify(resolve(__dirname, "regen.mjs"))}`);
  }
}
