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
import { loadWorkflow } from "../lib/workflow.mjs";

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

  // A change to the deploy workflow itself must redeploy every app: the push
  // trigger alone is not enough, the per-app filters would skip every job (#8894).
  const SELF = ".github/workflows/deploy-static.yml";

  it("the push trigger lists the workflow's own path", () => {
    expect(triggerPaths()).toContain(SELF);
  });

  it.each(APPS)("%s: its filter lists the workflow's own path", (app) => {
    expect(filterPaths(app)).toContain(SELF);
  });

  it.each(APPS)("%s: every bundled package triggers the workflow", (app) => {
    const paths = triggerPaths();
    const missing = runtimeClosure(app, dirs).filter((dir) => !paths.includes(`${dir}/**`));
    expect(missing).toEqual([]);
  });
});

/**
 * Every `VITE_*` variable an app (or a workspace package it bundles) reads must
 * be set in that app's build step: Vite inlines them at build time, and an unset
 * one ships as `undefined` with no error (#8894). Mirrors the Sentry-only pin in
 * deploy-static-sentry-env.test.mjs for the rest of the variables.
 */
const VITE_ENV_ALLOWLIST = new Set([
  // Add a name here only with a comment saying why the build need not set it.
]);

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "e2e", "__tests__", "test", "coverage"].includes(entry.name))
        continue;
      out.push(...sourceFiles(rel));
    } else if (
      /\.(ts|tsx|html)$/.test(entry.name) &&
      !/\.(test|spec|stories)\.|\.d\.ts$/.test(entry.name)
    ) {
      out.push(rel);
    }
  }
  return out;
}

function viteVarsRead(app, dirs) {
  const names = new Set();
  for (const dir of runtimeClosure(app, dirs)) {
    for (const file of sourceFiles(dir)) {
      const text = readFileSync(join(ROOT, file), "utf8");
      for (const m of text.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)|%(VITE_[A-Z0-9_]+)%/g)) {
        names.add(m[1] ?? m[2]);
      }
    }
  }
  return [...names].sort();
}

function buildEnvKeys(app) {
  const step = Object.values(loadWorkflow("deploy-static.yml").jobs)
    .flatMap((job) => job.steps)
    .find((s) => s.run?.includes(`pnpm build --filter=@mbe/${app}`));
  return step ? Object.keys(step.env ?? {}) : null;
}

describe("deploy-static.yml sets every VITE_* variable each app reads", () => {
  const dirs = workspaceDirs();

  it.each(APPS)("%s: build step env covers its VITE_* reads", (app) => {
    const keys = buildEnvKeys(app);
    expect(keys, `${app} build step not found`).not.toBeNull();
    const missing = viteVarsRead(app, dirs).filter(
      (name) => !keys.includes(name) && !VITE_ENV_ALLOWLIST.has(name)
    );
    expect(missing, `${app} build step is missing: ${missing.join(", ")}`).toEqual([]);
  });
});

/**
 * `APPS` above is a hand-written list, and nothing asserted it was complete, so
 * a new static app joined the repo invisible to every guard in this file.
 * apps/gen did exactly that: it has a wrangler.toml with an [assets] block like
 * the other three, but deploy-static.yml has no gen filter or job, so none of
 * the checks above ever looked at it.
 *
 * gen is deployed by Pulumi on purpose -- infrastructure/pulumi/index.ts manages
 * `mattbutlerengineering-gen` as a WorkersScript and says it "Replaces the
 * wrangler deploy in CI" -- so the fix is to declare its deploy owner, not to
 * add it to deploy-static.yml. These two checks make that declaration
 * mandatory: a static app that is in neither list fails here, and a
 * Pulumi-deployed app whose runtime closure outgrows pulumi-up.yml's push
 * trigger fails too. Same property the deploy-static.yml checks above enforce
 * (#7487), applied to the other deploy path.
 */
const PULUMI_DEPLOYED = ["gen"];

/** apps/<name> directories that ship as a Cloudflare Worker with static assets. */
function staticApps() {
  return readdirSync(join(ROOT, "apps"))
    .filter((name) => existsSync(join(ROOT, "apps", name, "wrangler.toml")))
    .sort();
}

/** Repo-relative dirs listed under a workflow's push `paths:`. */
function pushTriggerPaths(workflow, endMarker) {
  const text = readFileSync(join(ROOT, ".github/workflows", workflow), "utf8");
  const block = text.slice(text.indexOf("paths:"), text.indexOf(endMarker));
  return [...block.matchAll(/^\s+-\s+"([^"]+)"/gm)].map((m) => m[1]);
}

describe("every static app has a declared deploy owner", () => {
  it("each apps/* with a wrangler.toml is in APPS or PULUMI_DEPLOYED", () => {
    const declared = [...APPS, ...PULUMI_DEPLOYED].sort();
    expect(staticApps()).toEqual(declared);
  });

  it.each(PULUMI_DEPLOYED)("%s: every bundled package triggers Pulumi Deploy", (app) => {
    const dirs = workspaceDirs();
    const paths = pushTriggerPaths("pulumi-up.yml", "workflow_run:");
    const closure = runtimeClosure(app, dirs);
    // Both sides must be non-trivial, or an empty closure (or an unparsed
    // trigger block) would make the assertion below pass having checked
    // nothing.
    expect(closure).toContain("packages/rialto");
    expect(paths).toContain(`apps/${app}/**`);
    const missing = closure.filter((dir) => !paths.includes(`${dir}/**`));
    expect(missing, `pulumi-up.yml push trigger is missing: ${missing.join(", ")}`).toEqual([]);
  });
});
