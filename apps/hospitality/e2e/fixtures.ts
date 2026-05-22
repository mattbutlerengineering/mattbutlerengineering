import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import { injectAuth0Session } from "./auth-helpers.js";
import { mockApi } from "./api-mocks.js";

/* eslint-disable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks */
export const test = base.extend<{ authPage: Page; mockedPage: Page }>({
  authPage: async ({ page }, use) => {
    await injectAuth0Session(page);
    await use(page);
  },
  mockedPage: async ({ page }, use) => {
    await mockApi(page);
    await injectAuth0Session(page);
    await use(page);
  },
});
/* eslint-enable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks */

export { expect } from "@playwright/test";
