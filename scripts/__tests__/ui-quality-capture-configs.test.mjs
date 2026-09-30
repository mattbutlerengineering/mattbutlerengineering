import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The ui-quality capture configs (docs/features/ui-quality-loop/architecture.md
 * § Components "Capture"): each extends its app's base Playwright config,
 * collects only `ui-quality.capture.ts`, launches whatever `browser.mjs
 * resolve` exported, and serves the built dist with `vite preview`. The base
 * config must never collect the capture spec — `test:e2e` and the
 * workflow-coverage tests stay exactly as they were.
 */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APPS = ["marketing", "rialto-web"];

const read = (app, file) => readFileSync(join(REPO, "apps", app, file), "utf8");

/**
 * What Playwright would run under `config`, via its own `--list`, filtered to
 * the capture spec's path (an unfiltered `--list` of rialto-web's base config
 * also loads its vitest `*.test.ts` files and throws — unrelated to this).
 */
function listed(app, config) {
  const args = [
    "exec",
    "playwright",
    "test",
    "--config",
    config,
    "--list",
    "--pass-with-no-tests",
    "ui-quality.capture",
  ];
  const out = execFileSync("pnpm", args, {
    cwd: join(REPO, "apps", app),
    encoding: "utf8",
    env: { ...process.env, UI_QUALITY_PLAN: "", CI: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out;
}

describe.each(APPS)("%s ui-quality capture config", (app) => {
  const config = read(app, "playwright.ui-quality.config.ts");

  it("extends the app's base config", () => {
    expect(config).toMatch(/import baseConfig from "\.\/playwright\.config"/);
    expect(config).toMatch(/\.\.\.baseConfig/);
  });

  it("collects only ui-quality.capture.ts", () => {
    expect(config).toContain("testMatch: /ui-quality\\.capture\\.ts$/");
  });

  it("launches the browser browser.mjs resolved, from UI_QUALITY_CHROMIUM", () => {
    expect(config).toMatch(/executablePath:\s*process\.env\.UI_QUALITY_CHROMIUM/);
  });

  it("has no setup-project dependency and serves the built dist with vite preview", () => {
    expect(config).not.toMatch(/dependencies:/);
    expect(config).toMatch(
      new RegExp(`pnpm --dir apps/${app} exec vite preview --port \\d+ --strictPort`)
    );
  });

  it("spec reads UI_QUALITY_PLAN through the shared helper and calls capturePage", () => {
    const spec = read(app, "e2e/ui-quality.capture.ts");
    expect(spec).toContain('from "@mbe/test-fixtures/ui-quality-capture"');
    expect(spec).toMatch(new RegExp(`loadCapturePlan\\("${app}"\\)`));
    expect(spec).toContain("capturePage(");
  });

  it("is what Playwright collects under it, and the base config never collects it", () => {
    expect(listed(app, "playwright.ui-quality.config.ts")).toMatch(
      /ui-quality\.capture\.ts.*\n.*Total: 1 test in 1 file/
    );
    expect(listed(app, "playwright.config.ts")).toMatch(/Total: 0 tests in 0 files/);
  });
});
