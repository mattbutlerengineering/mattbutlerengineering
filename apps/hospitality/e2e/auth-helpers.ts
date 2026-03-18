import type { Page } from "@playwright/test";

/**
 * Performs the full Auth0 login flow on the given page.
 * Handles identifier-first flow and consent screen.
 */
export async function loginViaAuth0(page: Page): Promise<void> {
  const email = process.env.E2E_AUTH_EMAIL;
  const password = process.env.E2E_AUTH_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD env vars are required. " +
        "Create a test user in Auth0 (email/password, no MFA) and export these variables."
    );
  }

  // Navigate to the hospitality app
  await page.goto("/");

  // Click the Sign In button to trigger Auth0 redirect
  await page.getByRole("button", { name: "Sign In" }).click();

  // Wait for Auth0 hosted login page
  await page.waitForURL(/auth0\.com/, { timeout: 15_000 });

  // Step 1 — enter email and click Continue
  const emailInput = page.locator('input[name="username"], input[type="email"]').first();
  await emailInput.fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Step 2 — enter password and submit
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await passwordInput.waitFor({ state: "visible", timeout: 10_000 });
  await passwordInput.fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Step 3 — handle consent screen if it appears (first login only)
  const acceptButton = page.getByRole("button", { name: "Accept" });
  try {
    await acceptButton.waitFor({ state: "visible", timeout: 5_000 });
    await acceptButton.click();
  } catch {
    // Consent screen didn't appear — already authorized
  }

  // Wait for redirect back to the hospitality app (with or without trailing slash)
  await page.waitForURL(/\/hospitality/, { timeout: 15_000 });
}
