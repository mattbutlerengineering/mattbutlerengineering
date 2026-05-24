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

  // Wait for either the authenticated layout or the login prompt (which indicates failure)
  const authLayout = page.getByTestId("auth-layout");
  const loginPrompt = page.getByTestId("login-prompt");

  await expect(async () => {
    const isAuthVisible = await authLayout.isVisible();
    const isLoginVisible = await loginPrompt.isVisible();

    if (isLoginVisible && !isAuthVisible) {
      throw new Error("Authentication failed: stuck on login prompt after injection.");
    }

    expect(isAuthVisible).toBe(true);
  }).toPass({ timeout: 10_000 });

  await expect(page.getByRole("button", { name: "Sign In" })).not.toBeVisible();
});
