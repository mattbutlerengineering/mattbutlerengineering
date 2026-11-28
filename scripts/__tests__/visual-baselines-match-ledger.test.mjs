/**
 * No committed visual baseline may outlive its route (#10235).
 *
 * Each app's `e2e/visual.spec.ts` screenshots the coverage ledger's `page` rows
 * at two viewports. A route that stops being a `page` row (turned into a
 * redirect, or removed) leaves its PNGs behind: nothing compares against them,
 * and nothing fails either, so they sit in `e2e/screenshots/` looking like
 * coverage.
 *
 * One direction only. A page row with no committed baseline is the spec's own
 * failure (a missing snapshot), and only a Linux run can create the PNG.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");

const APPS = ["marketing", "hospitality"];

/** The ui-quality VIEWPORTS both specs capture (scripts/ui-quality/config.mjs). */
const VIEWPORTS = ["1280x720", "375x812"];

const pageRoutes = (app) =>
  read("metrics/ui-quality-ledger.jsonl")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line))
    .filter((row) => row.app === app && row.kind === "page")
    .map((row) => row.route);

/**
 * The file a row's snapshot lands in: the spec's `slug(route)@WxH.png`, after
 * Playwright replaces each run of characters outside [A-Za-z0-9] in the name
 * with one `-`.
 */
const baselineName = (route, viewport) =>
  `${(route === "/" ? "home" : route).replace(/[^A-Za-z0-9]+/g, "-")}-${viewport}.png`;

/** Tracked files only: other specs write untracked debug shots into the same directory. */
const committedBaselines = (app) =>
  execFileSync("git", ["ls-files", `apps/${app}/e2e/screenshots`], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((path) => path.endsWith(".png"))
    .map((path) => basename(path));

describe.each(APPS)("%s committed visual baselines", (app) => {
  it("names its snapshots the way this guard derives them", () => {
    const spec = read(`apps/${app}/e2e/visual.spec.ts`);
    expect(spec).toContain(
      'const slug = (route: string) => (route === "/" ? "home" : route.replace(/\\W+/g, "_"));'
    );
    expect(spec).toContain("toHaveScreenshot(`${slug(route)}@${width}x${height}.png`");
  });

  it("holds no PNG that no ledger page row produces", () => {
    const produced = new Set(
      pageRoutes(app).flatMap((route) => VIEWPORTS.map((viewport) => baselineName(route, viewport)))
    );
    expect(produced.size).toBeGreaterThan(0);
    const orphaned = committedBaselines(app).filter((name) => !produced.has(name));
    expect(orphaned).toEqual([]);
  });
});
