import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import { injectAuth0Session } from "./auth-helpers.js";

/**
 * Extended Playwright test with an `authPage` fixture.
 * Injects Auth0 tokens via ROPC so every test starts fully authenticated.
 *
 * Usage:
 *   import { test, expect } from "./fixtures.js";
 *   test("some authenticated test", async ({ authPage }) => {
 *     await authPage.goto("/reservations");
 *     ...
 *   });
 */
export const test = base.extend<{ authPage: Page }>({
  authPage: async ({ page }, use) => {
    await injectAuth0Session(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
