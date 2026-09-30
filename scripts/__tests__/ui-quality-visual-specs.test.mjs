/**
 * Shape guard for the VR floor's visual specs + configs
 * (docs/features/ui-quality-loop/architecture.md § Components "VR floor").
 *
 * Each spec enumerates the coverage ledger's `page` rows for its app at test
 * time — an fs read of data, never an import — so a new route fails with a
 * missing snapshot instead of silently going uncovered. Each app's base config
 * ignores the spec, and its visual config collects only it, so the bare
 * `test:e2e` never double-runs it.
 *
 * Text-level, like ui-quality-capture-configs.test.mjs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");

const APPS = ["marketing"];

describe.each(APPS)("%s visual spec + configs", (app) => {
  const spec = read(`apps/${app}/e2e/visual.spec.ts`);
  const visualConfig = read(`apps/${app}/playwright.visual.config.ts`);
  const baseConfig = read(`apps/${app}/playwright.config.ts`);
  const noiseFloorConfig = read(`apps/${app}/playwright.noise-floor.config.ts`);

  it("reads the ledger and the route fixtures from disk, not through an import", () => {
    expect(spec).toMatch(/readFileSync/);
    expect(spec).toMatch(/metrics\/ui-quality-ledger\.jsonl/);
    expect(spec).toMatch(/scripts\/ui-quality\/route-fixtures\.json/);
    expect(spec).not.toMatch(/^import[^;]*ui-quality-ledger/m);
    expect(spec).toMatch(new RegExp(`const APP = "${app}";`));
    expect(spec).toMatch(/row\.app === APP && row\.kind === "page"/);
  });

  it("screenshots every page at 1280×720 and 375×812 after reduced motion + networkidle", () => {
    expect(spec).toMatch(/width:\s*1280,\s*height:\s*720/);
    expect(spec).toMatch(/width:\s*375,\s*height:\s*812/);
    expect(spec).toMatch(/reducedMotion:\s*"reduce"/);
    expect(spec).toMatch(/waitForLoadState\("networkidle"\)/);
    expect(spec).toMatch(/toHaveScreenshot\(/);
  });

  it("passes no tolerance at a call site — the config owns it", () => {
    const calls = [...spec.matchAll(/toHaveScreenshot\s*\(([\s\S]*?)\)\s*;/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const [, args] of calls) expect(args).not.toMatch(/threshold|maxDiffPixel/);
  });

  it("the visual config collects only visual.spec.ts, into e2e/screenshots/", () => {
    expect(visualConfig).toMatch(/testMatch:\s*\/visual\\\.spec\\\.ts\$\//);
    expect(visualConfig).toMatch(/testIgnore:\s*\[\]/);
    expect(visualConfig).toMatch(
      /snapshotPathTemplate:\s*"\{testDir\}\/screenshots\/\{arg\}\{ext\}"/
    );
    expect(visualConfig).toMatch(/\bthreshold\s*:/);
    expect(visualConfig).toMatch(/\bmaxDiffPixels\s*:/);
  });

  it("the base config ignores visual.spec.ts, so bare test:e2e never runs it", () => {
    expect(baseConfig).toMatch(/testIgnore:\s*\[[^\]]*"\*\*\/visual\.spec\.ts"[^\]]*\]/);
  });

  it("has a perturbed noise-floor config over the visual one", () => {
    expect(noiseFloorConfig).toMatch(/from "\.\/playwright\.visual\.config"/);
    expect(noiseFloorConfig).toMatch(/stylePath/);
  });
});
