#!/usr/bin/env node
/**
 * browser.mjs — find a Chromium the capture specs can launch
 * (docs/features/ui-quality-loop/architecture.md § Components "Capture").
 *
 * The routine's sandbox ships a `chromium_headless_shell` whose revision does
 * not match the repo's Playwright, and `cdn.playwright.dev` is not
 * egress-allowlisted, so `playwright install` is not an option. Resolution
 * order, first launchable wins:
 *
 *   1. `$UI_QUALITY_CHROMIUM`
 *   2. Playwright's own registry path for the installed version, if on disk
 *   3. any `chromium-*` / `chromium_headless_shell-*` binary in a Playwright
 *      cache (`$PLAYWRIGHT_BROWSERS_PATH`, `~/.cache/ms-playwright`,
 *      `~/Library/Caches/ms-playwright`), any revision, newest first
 *   4. `which chromium chromium-browser google-chrome`
 *
 * Each candidate is launched once to prove it; a binary that exists but will
 * not start (wrong revision, missing libs) is skipped, not trusted.
 *
 * Usage: node scripts/ui-quality/browser.mjs resolve
 *   exit 0 — prints the path (the routine exports it as UI_QUALITY_CHROMIUM)
 *   exit 3 — nothing launches: the fire records `blocker: no-browser`
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);

export const EXIT_NO_BROWSER = 3;
const WHICH_NAMES = ["chromium", "chromium-browser", "google-chrome"];
const REVISION_DIR = /^(chromium|chromium_headless_shell)-(\d+)$/;
const BINARY_NAMES = ["chrome", "headless_shell", "chrome-headless-shell"];
const LAUNCH_TIMEOUT_MS = 30_000;

function cacheRoots({ env, homedir: home }) {
  return [
    env.PLAYWRIGHT_BROWSERS_PATH,
    join(home, ".cache", "ms-playwright"),
    join(home, "Library", "Caches", "ms-playwright"),
  ].filter(Boolean);
}

function safeReaddir(readdir, dir) {
  try {
    return readdir(dir);
  } catch {
    return [];
  }
}

/** Revision dirs newest first; at one revision the headless shell before full chromium. */
function byRevisionDesc(a, b) {
  if (a.revision !== b.revision) return b.revision - a.revision;
  return a.name < b.name ? 1 : -1;
}

/** Every executable inside one revision dir: `<platform>/<binary>` or a macOS `.app`. */
function binariesIn(revDir, { readdir, exists }) {
  const found = [];
  for (const platform of safeReaddir(readdir, revDir)) {
    const dir = join(revDir, platform);
    for (const name of BINARY_NAMES) {
      if (exists(join(dir, name))) found.push(join(dir, name));
    }
    for (const entry of safeReaddir(readdir, dir).filter((e) => e.endsWith(".app"))) {
      const bin = join(dir, entry, "Contents", "MacOS", entry.slice(0, -".app".length));
      if (exists(bin)) found.push(bin);
    }
  }
  return found;
}

function cachedBinaries(deps) {
  const revisions = cacheRoots(deps).flatMap((root) =>
    safeReaddir(deps.readdir, root)
      .map((name) => ({ root, name, match: REVISION_DIR.exec(name) }))
      .filter((r) => r.match)
      .map((r) => ({ ...r, revision: Number(r.match[2]) }))
  );
  return revisions.sort(byRevisionDesc).flatMap((r) => binariesIn(join(r.root, r.name), deps));
}

/** Every existing candidate, in resolution order, deduped. */
export function candidates(deps) {
  const list = [
    deps.env.UI_QUALITY_CHROMIUM,
    deps.registryPath(),
    ...cachedBinaries(deps),
    ...WHICH_NAMES.map((name) => deps.which(name)),
  ].filter((p) => typeof p === "string" && p !== "" && deps.exists(p));
  return [...new Set(list)];
}

/** The first candidate that launches, or null. */
export async function resolveBrowser(deps, log = () => {}) {
  for (const path of candidates(deps)) {
    try {
      await deps.launch(path);
      return path;
    } catch (err) {
      log(`browser.mjs: ${path} did not launch — ${err.message.split("\n")[0]}\n`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Real bindings
// ---------------------------------------------------------------------------

function playwright() {
  return require_("@playwright/test");
}

const realDeps = {
  env: process.env,
  homedir: homedir(),
  exists: existsSync,
  readdir: readdirSync,
  registryPath: () => {
    try {
      return playwright().chromium.executablePath();
    } catch {
      return null;
    }
  },
  which: (name) => {
    try {
      return execFileSync("which", [name], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  },
  launch: async (executablePath) => {
    const browser = await playwright().chromium.launch({
      executablePath,
      timeout: LAUNCH_TIMEOUT_MS,
    });
    await browser.close();
  },
};

/**
 * @param {string[]} argv
 * @param {object} [deps] env, homedir, exists, readdir, registryPath, which, launch, stdout, stderr
 * @returns {Promise<number>} exit code
 */
export async function main(argv, deps = {}) {
  const ctx = {
    ...realDeps,
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    ...deps,
  };
  if (argv[0] !== "resolve") {
    ctx.stderr("Usage: browser.mjs resolve\n");
    return 2;
  }
  const tried = candidates(ctx);
  const path = await resolveBrowser(ctx, ctx.stderr);
  if (path === null) {
    ctx.stderr(
      `browser.mjs resolve: no launchable Chromium (tried: ${tried.length ? tried.join(", ") : "none found"})\n`
    );
    return EXIT_NO_BROWSER;
  }
  ctx.stdout(`${path}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
