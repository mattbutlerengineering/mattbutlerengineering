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

const APPS = ["marketing", "hospitality"];

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

  // Verify's e2e-selector-drift-reviewer FLAG (breakdown Milestone 5b): a
  // baseline of an error state records the error as correct.
  it("fails a row that reaches a same-origin /api/ or /public/ request no mock answered", () => {
    expect(spec).toMatch(/unmockedApi/);
    expect(spec).toMatch(/\(api\|public\)/);
    expect(spec).toMatch(/expect\(unmockedApi[^)]*\)\.toEqual\(\[\]\)/);
  });

  it("pins the clock to an explicit UTC instant and the browser to UTC", () => {
    expect(spec).toMatch(/const FIXED_NOW = new Date\("[0-9-]+T[0-9:]+Z"\)/);
    expect(visualConfig).toMatch(/timezoneId:\s*"UTC"/);
  });

  it("has a perturbed noise-floor config over the visual one", () => {
    expect(noiseFloorConfig).toMatch(/from "\.\/playwright\.visual\.config"/);
    expect(noiseFloorConfig).toMatch(/stylePath/);
  });
});

describe("hospitality visual spec — mocked API, fixed clock, the setup auth project", () => {
  const spec = read("apps/hospitality/e2e/visual.spec.ts");
  const visualConfig = read("apps/hospitality/playwright.visual.config.ts");

  it("uses mockedPage and a fixed clock, and covers auth0 rows too", () => {
    expect(spec).toMatch(/from "\.\/fixtures\.js"/);
    expect(spec).toMatch(/mockedPage/);
    expect(spec).toMatch(/clock\.setFixedTime/);
    expect(spec).not.toMatch(/auth === "public"/);
  });

  it("screenshots a built bundle through vite preview, never the dev server", () => {
    expect(visualConfig).toMatch(/webServer:\s*\{/);
    expect(visualConfig).toMatch(/vite build/);
    expect(visualConfig).toMatch(/vite preview/);
    expect(visualConfig).not.toMatch(/\bdev\b.*--port/);
    expect(visualConfig).toMatch(/reuseExistingServer:\s*false/);
  });

  it("re-bases the stored session's expires_at on FIXED_NOW, so the fixed clock cannot trip a refresh", () => {
    expect(spec).toMatch(/expires_at/);
    expect(spec).toMatch(/FIXED_NOW\.getTime\(\)/);
  });

  it("holds the SSE stream open in-page instead of letting it reconnect", () => {
    expect(spec).toMatch(/events\\?\/stream/);
    expect(spec).toMatch(/ReadableStream/);
  });

  it("keeps projects [setup, chromium] with chromium depending on setup", () => {
    expect(visualConfig).toMatch(/name:\s*"setup"/);
    expect(visualConfig).toMatch(/testMatch:\s*\/auth\\\.setup\\\.ts\//);
    expect(visualConfig).toMatch(/dependencies:\s*\["setup"\]/);
  });
});

// ui-quality-loop review M3: four marketing pages render committed JSON under
// apps/marketing/public/ that automation rewrites about twice a day. A
// baseline over the live file goes red on every metrics PR with nothing wrong
// in the product, so the visual rows read frozen copies instead.
describe("marketing visual spec — frozen data, never automation-rewritten JSON (review M3)", () => {
  const spec = read("apps/marketing/e2e/visual.spec.ts");
  const DATA_FILES = ["sensor-report", "ai-health-trends", "metrics", "acmm-report"];

  it.each(DATA_FILES)(
    "answers /%s.json from a frozen fixture under e2e/fixtures/visual/",
    (name) => {
      expect(spec).toMatch(new RegExp(`"/${name}\\.json"`));
      const fixture = JSON.parse(read(`apps/marketing/e2e/fixtures/visual/${name}.json`));
      expect(Object.keys(fixture).length).toBeGreaterThan(0);
    }
  );

  it("reads the frozen fixtures, never apps/marketing/public/", () => {
    expect(spec).toMatch(/fixtures\/visual\//);
    expect(spec).not.toMatch(/public\/[\w-]+\.json/);
  });

  it("widens the unmocked-request guard to any same-origin .json fetch", () => {
    expect(spec).toMatch(/\\\.json\$/);
  });

  it("pins FIXED_NOW after every frozen fixture's generated_at, so no page reads its data as from the future", () => {
    const fixedNow = Date.parse(spec.match(/const FIXED_NOW = new Date\("([^"]+)"\)/)[1]);
    for (const name of DATA_FILES) {
      const fixture = JSON.parse(read(`apps/marketing/e2e/fixtures/visual/${name}.json`));
      const generated = Date.parse(fixture.generated_at ?? fixture.generatedAt);
      expect(generated, name).toBeLessThan(fixedNow);
    }
  });
});

// ui-quality-loop review M2: marketing `/` baselined empty "Projects" and
// "Elsewhere" — scroll-reveal sections stay at opacity 0 until scrolled into
// view, and a fullPage screenshot never scrolls. The row reveals them first.
describe("marketing visual spec — scroll-revealed sections are rendered, never hidden (review M2)", () => {
  const spec = read("apps/marketing/e2e/visual.spec.ts");

  it("reveals scroll-triggered content with the shared capture helper before the screenshot", () => {
    expect(spec).toMatch(
      /import \{[^}]*\brevealLazyContent\b[^}]*\} from "@mbe\/test-fixtures\/ui-quality-capture"/
    );
    const reveal = spec.indexOf("await revealLazyContent(page)");
    expect(reveal).toBeGreaterThan(-1);
    expect(reveal).toBeLessThan(spec.indexOf("toHaveScreenshot("));
  });

  it("does not mask or hide the sections to get a stable shot", () => {
    expect(spec).not.toMatch(/\bmask\s*:/);
    expect(spec).not.toMatch(/data-reveal[^\n]*(display|visibility|opacity)/);
  });
});
