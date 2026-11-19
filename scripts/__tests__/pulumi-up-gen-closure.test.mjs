/**
 * `apps/gen` ships through Pulumi (a CF Worker whose assets come from
 * `apps/gen/dist`), not through deploy-static.yml, so
 * deploy-static-app-paths.test.mjs never saw it. Same class as #7487: a change
 * to a workspace package gen bundles must redeploy gen, or the fix ships
 * nowhere. pulumi-up.yml's push trigger is the only thing that redeploys it.
 *
 * The runtime closure is gen's `dependencies`, followed transitively through
 * workspace packages' own `dependencies`. devDependencies serve tests and build
 * config only, so they are not bundled and need no redeploy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = "apps/gen";

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

/** Repo-relative dirs of gen and every workspace package it bundles. */
function runtimeClosure(dirs) {
  const seen = new Set([APP]);
  const queue = [APP];
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

const yml = readFileSync(join(ROOT, ".github/workflows/pulumi-up.yml"), "utf8");

/** The `push.paths` globs, read from the block before `workflow_run:`. */
function pushPaths() {
  const block = yml.slice(yml.indexOf("paths:"), yml.indexOf("workflow_run:"));
  return [...block.matchAll(/^\s+-\s+"([^"]+)"/gm)].map((m) => m[1]);
}

describe("pulumi-up.yml redeploys gen when anything it bundles changes", () => {
  const dirs = workspaceDirs();

  it("resolves a non-trivial closure", () => {
    const closure = runtimeClosure(dirs);
    expect(closure).toContain("packages/rialto");
    expect(pushPaths().length).toBeGreaterThan(0);
  });

  it("every bundled workspace package is in the push trigger", () => {
    const paths = pushPaths();
    const missing = runtimeClosure(dirs).filter((dir) => !paths.includes(`${dir}/**`));
    expect(missing).toEqual([]);
  });
});
