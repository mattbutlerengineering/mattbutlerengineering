#!/usr/bin/env node
/**
 * regen-manifest.mjs — Manifest of all committed generated artifacts.
 *
 * Each entry describes one "artifact family":
 *   - id:        short machine-readable key
 *   - label:     human description used in output messages
 *   - command:   the shell command (run from repo root) that regenerates the artifact
 *   - outputs:   file paths (relative to repo root) checked by `git diff --quiet` to detect staleness
 *   - changedBy: OPTIONAL. `(path: string) => {command, outputs} | null`. Declares
 *                which single-file edits make this family stale, and how to
 *                regenerate just the affected slice (see familiesForChangedFile
 *                below). Families that don't participate in per-file
 *                change-detection (e.g. rialto-registry today) simply omit it.
 *
 * Usage:
 *   node scripts/regen-manifest.mjs                       # regenerate all families
 *   node scripts/regen-manifest.mjs --check                # exit non-zero if any artifact is stale
 *   node scripts/regen-manifest.mjs --families-for <path>  # print JSON: families a single edit affects
 *
 * Adding a 6th family:
 *   Append one more object to the FAMILIES array below following the same shape.
 *   No other code changes required. If the family should also react to a
 *   single file edit (e.g. a PostToolUse hook), give it a `changedBy(path)`
 *   function — familiesForChangedFile() is generic over whatever families it's
 *   given, so hooks that already call it (regen-dep-graph.sh, regen-llms.sh)
 *   pick up the new family with ZERO hook edits.
 *
 * @module regen-manifest
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WORKSPACE_ROOTS } from "./merge-train-lock.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a command from the repo root without invoking a shell.
 *  Accepts a string (split on whitespace) or a [file, ...args] array.
 *  For --check mode pass { silent: true } to suppress stdio. */
function run(cmd, { silent = false } = {}) {
  const [file, ...args] = Array.isArray(cmd) ? cmd : cmd.split(/\s+/);
  execFileSync(file, args, {
    cwd: ROOT,
    stdio: silent ? "pipe" : "inherit",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

/** Returns true when all listed paths are unmodified vs. the index. */
function isClean(paths) {
  try {
    run(["git", "diff", "--quiet", "--", ...paths], { silent: true });
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
      "infrastructure/pulumi/llms.txt",
      "infrastructure/pulumi/llms-full.txt",
      "packages/agent-core/llms.txt",
      "packages/agent-core/llms-full.txt",
      "packages/agent-test-utils/llms.txt",
      "packages/agent-test-utils/llms-full.txt",
      "packages/api-client/llms.txt",
      "packages/api-client/llms-full.txt",
      "packages/auth/llms.txt",
      "packages/auth/llms-full.txt",
      "packages/config/llms.txt",
      "packages/config/llms-full.txt",
      "packages/database/llms.txt",
      "packages/database/llms-full.txt",
      "packages/gh-client/llms.txt",
      "packages/gh-client/llms-full.txt",
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
      "packages/supply-chain-scanner/llms.txt",
      "packages/supply-chain-scanner/llms-full.txt",
      "packages/test-fixtures/llms.txt",
      "packages/test-fixtures/llms-full.txt",
      "packages/types/llms.txt",
      "packages/types/llms-full.txt",
      "services/agent/llms.txt",
      "services/agent/llms-full.txt",
      "services/reservations/llms.txt",
      "services/reservations/llms-full.txt",
      "services/users/llms.txt",
      "services/users/llms-full.txt",
      "tools/cli/llms.txt",
      "tools/cli/llms-full.txt",
    ],
    // A single source-file edit only makes ONE package's llms.txt stale, not
    // all ~25 — regenerating (and diffing) every package for one file change
    // would be wasteful. Scope command + outputs down to the owning package.
    changedBy(path) {
      if (!isLlmsSource(path) || isRegenExcluded(path)) return null;
      const pkgDir = packageDirFor(path);
      if (!pkgDir || !llmsPackages().includes(pkgDir)) return null; // no committed llms.txt yet
      return {
        command: `pnpm --filter @mbe/cli start pack ${pkgDir}`,
        outputs: [`${pkgDir}/llms.txt`, `${pkgDir}/llms-full.txt`],
      };
    },
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
    id: "rialto-color-tokens",
    label: "packages/rialto colors.css + figma-tokens.json",
    command: "pnpm --filter @mattbutlerengineering/rialto generate:tokens",
    outputs: ["packages/rialto/src/tokens/colors.css", "packages/rialto/figma-tokens.json"],
    // Hook-scoped regen (PostToolUse): a token-source edit regenerates just
    // this family, mirroring the dep-graph/llms ergonomics.
    changedBy(path) {
      return /(^|\/)packages\/rialto\/(src\/tokens\/colors(\.dark)?\.json|scripts\/(generate-colors-css|generate-figma-tokens)\.ts|scripts\/lib\/color-tokens\.ts)$/.test(
        path
      )
        ? { command: this.command, outputs: this.outputs }
        : null;
    },
  },
  {
    id: "dep-graph-md",
    label: "docs/architecture/dependency-graph.md",
    command: "pnpm graph",
    outputs: ["docs/architecture/dependency-graph.md"],
    changedBy(path) {
      return isDependencyManifestChange(path)
        ? { command: this.command, outputs: this.outputs }
        : null;
    },
  },
  {
    id: "dep-graph-json",
    label: "infrastructure/worker/dep-graph.json",
    command: "pnpm generate:dep-graph",
    outputs: ["infrastructure/worker/dep-graph.json"],
    changedBy(path) {
      return isDependencyManifestChange(path)
        ? { command: this.command, outputs: this.outputs }
        : null;
    },
  },
];

// ---------------------------------------------------------------------------
// Regen-gating: source paths that trigger full regen vs. --check fast path
// ---------------------------------------------------------------------------

/**
 * Path prefixes: a changed file starting with any of these may affect one or
 * more generated artifact families and therefore requires `pnpm regen` (full).
 * Used by scripts/check-regen-needed.mjs to gate the regen step in the
 * implement-queue worker.
 *
 * Mirrors the workspace directories read by `mbe pack` (llms-txt) and the
 * package.json paths read by the dep-graph generators.
 *
 * The apps/packages/services trio comes from merge-train-lock's
 * WORKSPACE_ROOTS (the tree-vocabulary this list mirrors); tools/,
 * infrastructure/, and pnpm-workspace.yaml are regen-specific extras that
 * aren't part of that shared vocabulary.
 */
export const REGEN_SOURCE_PREFIXES = [
  ...WORKSPACE_ROOTS.map((rootDir) => `${rootDir}/`),
  "tools/",
  "infrastructure/",
  "pnpm-workspace.yaml",
];

/**
 * Exclusion patterns: paths that match a REGEN_SOURCE_PREFIX but should NOT
 * trigger full regen. Mirrors the `ignore` list in `mbe pack`
 * (tools/cli/src/commands/pack.ts) so the gating decision stays in sync with
 * what the generator actually reads.
 */
export const REGEN_SOURCE_EXCLUDES = [
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /\/dist\//,
  /\/generated\//,
  /\/node_modules\//,
  /vitest\.config\.[cm]?[jt]sx?$/,
  /llms(?:-full)?\.txt$/,
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
// familiesForChangedFile — single-file change detection (issue #2968)
//
// PostToolUse hooks (regen-dep-graph.sh, regen-llms.sh) call this via
// `--families-for <path>` instead of re-encoding output paths, commands, or
// package-ownership rules in bash. All matching logic lives here, next to
// the families it describes — the manifest is the single owner.
// ---------------------------------------------------------------------------

const DEP_MANIFEST_RE = /(^|\/)(package\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml)$/;
const LLMS_SOURCE_RE = /\.(ts|tsx|prisma)$|(^|\/)CLAUDE\.md$/;
// Matches a package segment anywhere in the path (mirrors DEP_MANIFEST_RE's
// `(^|/)` style), not just at the start. A plain repo-root-relative path
// (e.g. "packages/rialto/src/Foo.tsx") still matches via `^`, but this also
// tolerates an absolute path whose prefix doesn't line up with the repo root
// (e.g. a hook computed `rel_path` from an unresolved CLAUDE_PROJECT_DIR
// while CLAUDE_FILE_PATH is symlink-resolved, or vice versa — see #2983).
// Root alternation is built from WORKSPACE_ROOTS (+ the regen-specific
// "tools" extra) rather than restating the "apps|packages|services" prefixes.
const PACKAGE_DIR_RE = new RegExp(`(^|/)((?:${[...WORKSPACE_ROOTS, "tools"].join("|")})/[^/]+)/`);

/** True when `path` matches a REGEN_SOURCE_EXCLUDES pattern (test/dist/generated/etc). */
function isRegenExcluded(path) {
  return REGEN_SOURCE_EXCLUDES.some((re) => re.test(path));
}

/** True when `path` is a dependency manifest that can change the dep graph. */
function isDependencyManifestChange(path) {
  return DEP_MANIFEST_RE.test(path) && !isRegenExcluded(path);
}

/** True when `path` is a source file `mbe pack` reads into llms.txt. */
function isLlmsSource(path) {
  return LLMS_SOURCE_RE.test(path);
}

/** Workspace package directory (e.g. "packages/foo") owning `path`, or null. */
function packageDirFor(path) {
  const match = PACKAGE_DIR_RE.exec(path);
  return match ? match[2] : null;
}

/**
 * Given a file path (relative to repo root) that just changed, returns the
 * generated-artifact families it makes stale — each already resolved to the
 * concrete command + outputs a hook should act on. Returns [] for files that
 * don't feed any generator.
 *
 * Pure and generic: it only ever calls each family's own `changedBy(path)` —
 * it has no per-family knowledge itself, so a family that declares
 * `changedBy` is picked up automatically with zero edits to this function or
 * to any hook that calls it. The `families` param defaults to the real
 * manifest but lets tests prove that extensibility without mutating it.
 *
 * @param {string} path - repo-root-relative path of the changed file.
 * @param {Array<{id: string, label: string, changedBy?: (path: string) => {command: string, outputs: string[]} | null}>} [families]
 * @returns {Array<{id: string, label: string, command: string, outputs: string[]}>}
 */
export function familiesForChangedFile(path, families = FAMILIES) {
  const matches = [];
  for (const family of families) {
    if (typeof family.changedBy !== "function") continue;
    const scoped = family.changedBy(path);
    if (scoped) {
      matches.push({
        id: family.id,
        label: family.label,
        command: scoped.command,
        outputs: scoped.outputs,
      });
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const checkMode = process.argv.includes("--check");
  const familiesForFlagIdx = process.argv.indexOf("--families-for");

  if (familiesForFlagIdx !== -1) {
    // Shell-consumable mode for hooks: print the JSON array of families a
    // single changed file affects, so bash never has to know a family's
    // output paths or regen command — see regen-dep-graph.sh / regen-llms.sh.
    const changedPath = process.argv[familiesForFlagIdx + 1];
    if (!changedPath) {
      console.error("Usage: regen-manifest.mjs --families-for <path>");
      process.exit(1);
    }
    console.log(JSON.stringify(familiesForChangedFile(changedPath)));
  } else if (checkMode) {
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
    run(["node", resolve(__dirname, "regen.mjs")]);
  }
}
