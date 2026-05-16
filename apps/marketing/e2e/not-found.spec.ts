import { test, expect } from "@playwright/test";

test.describe("404 Not Found page", () => {
  test("renders 404 heading for unknown routes", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");

    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });

  test("shows descriptive message", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");

    await expect(
      page.getByText("This page doesn't exist")
    ).toBeVisible();
  });

  test("Back to home button navigates to homepage", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");

    await page.getByRole("link", { name: "Back to home" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("One-person team.")).toBeVisible();
  });
});
