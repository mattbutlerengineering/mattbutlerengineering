import { test as setup, expect } from "@playwright/test";
import { loginViaAuth0 } from "./auth-helpers.js";

/**
 * Gate test: if the Auth0 login flow is broken, all downstream tests are skipped.
 * Also saves Auth0 session cookies so subsequent logins skip the consent screen.
 */
setup("authenticate via Auth0", async ({ page }) => {
  await loginViaAuth0(page);

  // Verify we're authenticated — dashboard content should be visible
  await expect(page.getByTestId("dashboard-layout")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).not.toBeVisible();

  // Save Auth0 session cookies — speeds up subsequent logins (skips consent)
  await page.context().storageState({ path: "./e2e/.auth/user.json" });
});
