import { test, expect } from "./fixtures.js";
import { test as base } from "@playwright/test";

base.describe("Authentication — unauthenticated", () => {
  base("unauthenticated user sees login prompt", async ({ browser }) => {
    // Fresh context with no stored auth state
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:3002/hospitality/");

    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByTestId("dashboard-layout")).not.toBeVisible();

    await context.close();
  });
});

test.describe("Authentication — authenticated", () => {
  test("programmatic login loads dashboard", async ({ authPage }) => {
    await expect(authPage.getByTestId("dashboard-layout")).toBeVisible();
    await expect(authPage.getByRole("button", { name: "Sign In" })).not.toBeVisible();
  });

  test("authenticated session persists across navigation", async ({ authPage }) => {
    // Use client-side navigation via the sidebar
    await authPage
      .getByRole("button", { name: "Reservations" })
      .or(authPage.getByText("Reservations"))
      .first()
      .click();

    // Should still be authenticated
    await expect(authPage.getByTestId("dashboard-layout")).toBeVisible();
    await expect(authPage.getByRole("button", { name: "Sign In" })).not.toBeVisible();
  });
});
