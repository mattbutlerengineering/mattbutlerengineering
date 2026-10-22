import { test, expect } from "./fixtures.js";

test.describe("Auth", () => {
  test("unauthenticated user sees login prompt", async ({ page }) => {
    await page.goto("");
    await expect(
      page.getByRole("heading", { name: "Turn a prompt into a live interface with Gen" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("Sign In button is enabled", async ({ page }) => {
    await page.goto("");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeEnabled();
  });

  test("callback route without OIDC params falls back to the login landing", async ({ page }) => {
    // No code/state to exchange, so the auth gate settles signed-out instead of erroring
    await page.goto("callback");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });
});
