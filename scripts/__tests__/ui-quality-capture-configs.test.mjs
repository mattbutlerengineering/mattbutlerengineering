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
const APPS = ["marketing", "rialto-web", "hospitality"];

const PLACEHOLDER_E2E_ENV = Object.fromEntries(
  [
    "E2E_AUTH0_DOMAIN",
    "E2E_AUTH0_CLIENT_ID",
    "E2E_AUTH0_AUDIENCE",
    "E2E_AUTH_EMAIL",
    "E2E_AUTH_PASSWORD",
  ].map((name) => [name, `placeholder-${name.toLowerCase()}`])
);

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
    // Placeholders: hospitality's base config always loads its `setup`
    // project's auth.setup.ts, which throws at import without these.
    env: { ...process.env, ...PLACEHOLDER_E2E_ENV, UI_QUALITY_PLAN: "", CI: "" },
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
    expect(listed(app, "playwright.config.ts")).not.toContain("ui-quality.capture.ts");
  });
});

describe("hospitality capture specifics", () => {
  const config = read("hospitality", "playwright.ui-quality.config.ts");
  const spec = read("hospitality", "e2e/ui-quality.capture.ts");

  it("builds with .env.example's placeholder VITE_AUTH_* so validateAuthConfig() never renders AuthConfigError", () => {
    expect(config).toContain(".env.example");
    expect(config).toMatch(/VITE_AUTH_/);
    expect(config).toMatch(/exec vite build && pnpm --dir apps\/hospitality exec vite preview/);
  });

  it("drops the base config's setup project and stored auth session", () => {
    expect(config).not.toMatch(/storageState/);
    expect(config).not.toMatch(/auth\.setup/);
    expect(config).toMatch(/projects:/);
  });

  it("installs mockApi and a fixed clock before capturePage (the timeline.spec.ts pattern)", () => {
    const mock = spec.indexOf("mockApi(page)");
    const clock = spec.indexOf("page.clock.setFixedTime(");
    const capture = spec.indexOf("capturePage(");
    expect(mock).toBeGreaterThan(-1);
    expect(clock).toBeGreaterThan(-1);
    expect(capture).toBeGreaterThan(Math.max(mock, clock));
  });
});
