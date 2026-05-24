import { test as setup, expect } from "@playwright/test";
import { injectAuth0Session } from "./auth-helpers.js";

/**
 * Gate test: validates that programmatic Auth0 login works.
 * If this fails, all downstream tests (which depend on "setup") are skipped.
 *
 * Required env vars: E2E_AUTH0_DOMAIN, E2E_AUTH0_CLIENT_ID,
 * E2E_AUTH0_AUDIENCE, E2E_AUTH_EMAIL, E2E_AUTH_PASSWORD
 */
setup("authenticate via Auth0", async ({ page }) => {
  await injectAuth0Session(page);

  await expect(page.getByTestId("auth-layout")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Sign In" })).not.toBeVisible();
});
