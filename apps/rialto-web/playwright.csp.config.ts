import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * Runs e2e/csp.spec.ts against the *built* output under the real production
 * Content-Security-Policy. See docs/fixes/e2e-behind-edge-csp/architecture.md.
 *
 * Separate from playwright.config.ts on purpose: that one serves `vite dev`,
 * which ships a module graph production never sees and sets no policy at all.
 * Keeping this additive leaves the visual job's Linux-CI baselines untouched.
 */

const BASE_URL = "http://localhost:4173/rialto/";

// Playwright defaults webServer.cwd to the config file's directory. The
// command below is written from the repo root (`--dir apps/rialto-web`), so
// pin the cwd rather than letting it resolve to apps/rialto-web/apps/…, which
// fails with ENOENT.
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  ...baseConfig,
  // The base config ignores csp.spec.ts so a bare local `playwright test`
  // never runs it against the CSP-less dev server. Spreading baseConfig
  // carries that ignore in here too, where it would silence *every* test and
  // leave this config passing green over zero tests forever.
  testIgnore: [],
  testMatch: "**/csp.spec.ts",
  use: { ...baseConfig.use, baseURL: BASE_URL },
  webServer: {
    // `pnpm exec vite preview`, never `pnpm preview -- --port`: the `preview`
    // script *is* `vite preview`, so pnpm forwards `--` literally and vite
    // reads the flags as positional args and ignores them.
    command: "pnpm --dir apps/rialto-web exec vite preview --port 4173 --strictPort",
    cwd: REPO_ROOT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
