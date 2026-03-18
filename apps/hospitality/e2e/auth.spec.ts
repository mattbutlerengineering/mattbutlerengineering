import { test, expect } from "@playwright/test";
import { loginViaAuth0 } from "./auth-helpers.js";

test.describe("Authentication", () => {
  test("unauthenticated user sees login prompt", async ({ browser }) => {
    // Create a fresh context with no stored auth state
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:3002/hospitality/");

    // Sign In button should be visible
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

    // Dashboard should not be present
    await expect(page.getByTestId("dashboard-layout")).not.toBeVisible();

    await context.close();
  });

  test("full login flow loads dashboard", async ({ page }) => {
    // Login using Auth0 — storageState provides session cookies so consent is skipped
    await loginViaAuth0(page);

    // Should see the dashboard, not the login prompt
    await expect(page.getByTestId("dashboard-layout")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).not.toBeVisible();
  });

  test("authenticated session persists across navigation", async ({ page }) => {
    await loginViaAuth0(page);

    // Use client-side navigation via the sidebar (SPA navigation, not full reload)
    await page.getByRole("button", { name: "Reservations" }).or(
      page.getByText("Reservations")
    ).first().click();

    // Should still be authenticated — dashboard renders without login prompt
    await expect(page.getByTestId("dashboard-layout")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).not.toBeVisible();
  });
});
