import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * The ui-quality loop's capture run for hospitality
 * (docs/features/ui-quality-loop/architecture.md § Components "Capture").
 *
 * Driven by the daily routine, never by CI. Only the ledger's `public` rows
 * are ever planned for this app (`ledger.mjs due` writes `auth0` rows
 * `unreachable:auth` without attempting them), so the base config's `setup`
 * project and stored Auth0 session are dropped. The build bakes in
 * `.env.example`'s placeholder `VITE_AUTH_*`: with them empty,
 * `validateAuthConfig()` renders `AuthConfigError` on every route — public
 * ones included — and the loop would judge an error page.
 *
 *   UI_QUALITY_PLAN=$PWD/.ui-quality/plan.json UI_QUALITY_CHROMIUM=<path> \
 *     pnpm --dir apps/hospitality exec playwright test --config playwright.ui-quality.config.ts
 */

const BASE_URL = "http://localhost:4177/hospitality/";

// The webServer command is written from the repo root; pin its cwd.
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** `VITE_AUTH_*` placeholders from .env.example — never real credentials. */
const PLACEHOLDER_AUTH_ENV = Object.fromEntries(
  readFileSync(new URL("./.env.example", import.meta.url), "utf8")
    .split("\n")
    .map((line) => /^(VITE_AUTH_\w+)=(.*)$/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [m[1], m[2]])
);

export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  testMatch: /ui-quality\.capture\.ts$/,
  // One worker, no retries: a capture is idempotent and the next fire is tomorrow.
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: "list",
  use: {
    ...baseConfig.use,
    baseURL: BASE_URL,
    launchOptions: { executablePath: process.env.UI_QUALITY_CHROMIUM || undefined },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Build first so the placeholder auth env is in the bundle, then serve it.
    // `pnpm exec vite preview`, never `pnpm preview -- --port`: pnpm forwards
    // the `--` literally and vite then ignores the flags.
    command:
      "pnpm --dir apps/hospitality exec vite build && pnpm --dir apps/hospitality exec vite preview --port 4177 --strictPort",
    cwd: REPO_ROOT,
    env: PLACEHOLDER_AUTH_ENV,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
