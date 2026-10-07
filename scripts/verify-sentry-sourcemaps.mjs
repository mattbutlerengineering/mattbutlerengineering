#!/usr/bin/env node

/**
 * verify-sentry-sourcemaps.mjs — refuse to deploy a static app whose build
 * did not actually run sentryVitePlugin.
 *
 * Written for maintenance:static-sourcemaps-confirm. For months every
 * deploy-static build ran the plugin as a no-op (turbo's strict env mode
 * stripped SENTRY_AUTH_TOKEN before vite saw it), and nothing went red: a
 * build that uploaded source maps and one that silently skipped it exit 0
 * alike. The only trace a skipped run leaves is in dist/ itself, so that is
 * what this checks, after the build and before `wrangler deploy`:
 *
 *   - every JS chunk vite emitted under `assets/` carries the plugin's
 *     `sentry-dbid-` debug-ID snippet (the plugin prepends it to each chunk in
 *     renderChunk when enabled), and
 *   - no `*.map` file is left anywhere in dist/ (the plugin deletes them after
 *     uploading, via `filesToDeleteAfterUpload`).
 *
 * It also catches the case where a cached, tokenless dist/ is replayed:
 * `passThroughEnv` does not enter turbo's task hash, so a cache hit could
 * restore a dist/ built without the plugin.
 *
 * It cannot prove the upload itself succeeded. That is the plugin's
 * `errorHandler` (which rethrows) and the post-deploy check in Ship.
 *
 * Usage:
 *   node scripts/verify-sentry-sourcemaps.mjs <distDir>
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The marker getDebugIdSnippet() embeds in every injected chunk. */
const DEBUG_ID_MARKER = "sentry-dbid-";

/**
 * Vite's default `build.assetsDir`. Only files here are rollup chunks that
 * pass through the plugin's renderChunk. Files at the dist root (e.g.
 * vite-plugin-pwa's registerSW.js and sw.js) are written outside the bundle
 * and can never carry a debug ID.
 */
const CHUNK_DIR = "assets/";

/**
 * Decide whether a built dist/ shows sentryVitePlugin ran.
 *
 * Collects every problem rather than stopping at the first, so one red run
 * reports the full picture.
 *
 * @param {ReadonlyArray<{ path: string, content: string }>} files
 *   Every file in dist/, with posix paths relative to dist/.
 * @returns {{ ok: boolean, checkedChunks: number, problems: Array<{ kind: "missing-debug-id" | "leftover-map" | "no-chunks", path: string }> }}
 */
export function evaluateSentrySourcemaps(files) {
  const chunks = files.filter((f) => f.path.startsWith(CHUNK_DIR) && f.path.endsWith(".js"));

  const problems = [
    ...(chunks.length === 0 ? [{ kind: "no-chunks", path: CHUNK_DIR }] : []),
    ...chunks
      .filter((f) => !f.content.includes(DEBUG_ID_MARKER))
      .map((f) => ({ kind: "missing-debug-id", path: f.path })),
    ...files
      .filter((f) => f.path.endsWith(".map"))
      .map((f) => ({ kind: "leftover-map", path: f.path })),
  ];

  return { ok: problems.length === 0, checkedChunks: chunks.length, problems };
}

/**
 * Read every file under `distDir`. Contents are read only for `.js` files;
 * nothing else is inspected, so other files carry an empty string.
 *
 * Throws if `distDir` does not exist — a missing dist/ is a broken build, not
 * a pass.
 *
 * @param {string} distDir
 * @returns {Array<{ path: string, content: string }>}
 */
export function readDistFiles(distDir) {
  return readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolute = join(entry.parentPath, entry.name);
      const path = relative(distDir, absolute).split(sep).join("/");
      const content = path.endsWith(".js") ? readFileSync(absolute, "utf8") : "";
      return { path, content };
    });
}

const PROBLEM_DETAIL = {
  "missing-debug-id": "has no sentry-dbid- debug-ID snippet (sentryVitePlugin did not run on it)",
  "leftover-map": "is a source map that was not deleted after upload, and would ship",
  "no-chunks": "contains no .js chunks — is this the right dist directory?",
};

/* c8 ignore start -- CLI entrypoint, exercised by deploy-static.yml; the decision logic is unit-tested */
function main() {
  const distDir = process.argv[2];
  if (!distDir) {
    console.error("Usage: verify-sentry-sourcemaps.mjs <distDir>");
    process.exit(1);
  }

  const { ok, checkedChunks, problems } = evaluateSentrySourcemaps(readDistFiles(distDir));

  if (ok) {
    console.log(
      `${distDir}: all ${checkedChunks} chunk(s) carry a Sentry debug ID and no source maps remain.`
    );
    return;
  }

  for (const { kind, path } of problems) {
    console.error(`::error::${distDir}/${path} ${PROBLEM_DETAIL[kind]}`);
  }
  console.error(
    `${problems.length} problem(s). Source maps were not uploaded to Sentry for this build. Refusing to deploy.`
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
/* c8 ignore stop */
