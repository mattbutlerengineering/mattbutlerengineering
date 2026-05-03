import { test, expect } from "@playwright/test";

test.describe("Auth", () => {
  test("unauthenticated user sees login prompt", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Gen Playground")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("Sign In button is enabled", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeEnabled();
  });

  test("callback route redirects to home", async ({ page }) => {
    // Without a real OIDC state/code param, callback component redirects to /
    await page.goto("/callback");
    await expect(page).toHaveURL(/\/gen\/?(#.*)?$/);
  });
});
