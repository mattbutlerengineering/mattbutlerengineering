import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mockApi } from "./api-mocks.js";

/* eslint-disable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks */
export const test = base.extend<{ authPage: Page; mockedPage: Page }>({
  authPage: async ({ page }, use) => {
    // storageState (from auth.setup.ts) already provides the OIDC session.
    // Navigate so the React OIDC provider picks up the stored session.
    await page.goto("");
    await use(page);
  },
  mockedPage: async ({ page }, use) => {
    // Route API calls to fixtures first so no real network calls happen.
    await mockApi(page);
    // storageState provides auth — navigate to trigger OIDC session pickup.
    await page.goto("");
    await use(page);
    // mockApi's SSE-stream handler calls page.evaluate; the app opens the
    // stream on every load, so a request landing as the test ends makes the
    // in-flight callback throw `"page.evaluate: Test ended."` and fail the
    // test (run 29116315283). Drain routes with Playwright's documented
    // remedy before teardown.
    await page.unrouteAll({ behavior: "ignoreErrors" });
  },
});
/* eslint-enable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks */

export { expect } from "@playwright/test";
