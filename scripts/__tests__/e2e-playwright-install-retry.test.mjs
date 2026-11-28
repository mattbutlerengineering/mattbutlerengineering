import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const WORKFLOW = read(".github/workflows/e2e.yml");

/**
 * Hospitality E2E shard 3 failed with no test run: `playwright install --with-deps`
 * exited 100 because the runner's apt index could not locate the font packages
 * (#10091). Shards on other hosts installed fine, so the failure is per-host and
 * a refreshed index plus one retry recovers it. Every e2e.yml install goes
 * through scripts/playwright-install-with-retry.sh.
 */
describe("e2e.yml Playwright installs retry with a fresh apt index (#10091)", () => {
  it("has no bare `playwright install --with-deps` step", () => {
    expect(WORKFLOW).not.toMatch(/run:\s*npx playwright install --with-deps/);
  });

  it("installs through the retry script in every job that installs Playwright", () => {
    const calls = WORKFLOW.match(/bash scripts\/playwright-install-with-retry\.sh/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it("refreshes the apt index before retrying, and fails after the last attempt", () => {
    const script = read("scripts/playwright-install-with-retry.sh");
    expect(script).toMatch(/sudo apt-get update/);
    expect(script).toMatch(/playwright install --with-deps chromium/);
    expect(script).toMatch(/exit 1/);
  });
});
