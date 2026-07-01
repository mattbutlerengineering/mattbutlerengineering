import { test, expect } from "./fixtures.js";
import { test as base } from "@playwright/test";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

base.describe("Authentication — unauthenticated", () => {
  base("unauthenticated user sees login prompt", async ({ browser }) => {
    // Fresh context with no stored auth state.
    // NOTE: browser.newContext() with no options still inherits the project's
    // configured `use.storageState` (the "chromium" project points it at the
    // authenticated e2e/.auth/user.json written by auth.setup.ts). Passing
    // `storageState: undefined` explicitly overrides that default so this
    // context is genuinely logged out.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    await page.goto("");

    await expect(page.getByTestId("login-prompt")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByTestId("auth-layout")).not.toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/auth-login.png", fullPage: true });

    await context.close();
  });
});

test.describe("Authentication — authenticated", () => {
  test("programmatic login loads dashboard", async ({ mockedPage }) => {
    await expect(mockedPage.getByTestId("auth-layout")).toBeVisible();
    await expect(mockedPage.getByRole("button", { name: "Sign In" })).not.toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/auth-dashboard.png", fullPage: true });
  });

  test("authenticated session persists across navigation", async ({ mockedPage }) => {
    // Use client-side navigation via the sidebar
    await mockedPage
      .getByRole("button", { name: "Reservations" })
      .or(mockedPage.getByText("Reservations"))
      .first()
      .click();

    // Should still be authenticated
    await expect(mockedPage.getByTestId("auth-layout")).toBeVisible();
    await expect(mockedPage.getByRole("button", { name: "Sign In" })).not.toBeVisible();
  });
});
