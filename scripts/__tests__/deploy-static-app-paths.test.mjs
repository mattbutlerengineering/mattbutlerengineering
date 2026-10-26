/**
 * Every workspace package a static app bundles must redeploy that app when it
 * changes. #7487 fixed a seam bug in packages/rialto-catalog; deploy-static.yml's
 * trigger matched it, but the per-app `hospitality` filter listed only
 * apps/hospitality, packages/rialto and packages/auth, so Deploy Hospitality was
 * skipped and the fix shipped nowhere. Same class as #7464 for service images.
 *
 * The runtime closure is each app's `dependencies`, followed transitively through
 * workspace packages' own `dependencies`. Workspace devDependencies (config,
 * ui-quality-capture, edge-worker) serve e2e and build config only, so they are
 * not bundled and need no redeploy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APPS = ["marketing", "hospitality", "rialto-web"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Workspace package name -> repo-relative directory. */
function workspaceDirs() {
  const dirs = new Map();
  for (const parent of ["packages", "apps"]) {
    for (const name of readdirSync(join(ROOT, parent))) {
      const manifest = join(ROOT, parent, name, "package.json");
      if (existsSync(manifest)) dirs.set(readJson(manifest).name, `${parent}/${name}`);
    }
  }
  return dirs;
}

function workspaceDeps(dir, dirs) {
  const deps = readJson(join(ROOT, dir, "package.json")).dependencies ?? {};
  return Object.keys(deps).filter((name) => dirs.has(name));
}

/** Repo-relative dirs of the app and every workspace package it bundles. */
function runtimeClosure(app, dirs) {
  const seen = new Set([`apps/${app}`]);
  const queue = [`apps/${app}`];
  while (queue.length > 0) {
    for (const name of workspaceDeps(queue.shift(), dirs)) {
      const dir = dirs.get(name);
      if (!seen.has(dir)) {
        seen.add(dir);
        queue.push(dir);
      }
    }
  }
  return [...seen].sort();
}

const yml = readFileSync(join(ROOT, ".github/workflows/deploy-static.yml"), "utf8");

function triggerPaths() {
  const block = yml.slice(yml.indexOf("paths:"), yml.indexOf("workflow_dispatch:"));
  return [...block.matchAll(/^\s+-\s+"([^"]+)"/gm)].map((m) => m[1]);
}

/** The dorny/paths-filter globs listed under `<app>:` in the filters block. */
function filterPaths(app) {
  const filters = yml.slice(yml.indexOf("filters: |"));
  const start = filters.search(new RegExp(`^\\s+${app}:\\s*$`, "m"));
  const lines = filters.slice(start).split("\n").slice(1);
  const globs = [];
  for (const line of lines) {
    const m = line.match(/^\s+-\s+'([^']+)'/);
    if (!m) break;
    globs.push(m[1]);
  }
  return globs;
}

describe("deploy-static.yml redeploys each app when anything it bundles changes", () => {
  const dirs = workspaceDirs();

  it("resolves a non-trivial closure for every app", () => {
    for (const app of APPS) {
      expect(runtimeClosure(app, dirs)).toContain("packages/rialto");
      expect(filterPaths(app).length).toBeGreaterThan(0);
    }
  });

  it.each(APPS)("%s: every bundled package is in its filter", (app) => {
    const globs = filterPaths(app);
    const missing = runtimeClosure(app, dirs).filter((dir) => !globs.includes(`${dir}/**`));
    expect(missing).toEqual([]);
  });

  it.each(APPS)("%s: every bundled package triggers the workflow", (app) => {
    const paths = triggerPaths();
    const missing = runtimeClosure(app, dirs).filter((dir) => !paths.includes(`${dir}/**`));
    expect(missing).toEqual([]);
  });
});
