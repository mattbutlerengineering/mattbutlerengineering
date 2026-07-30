import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("hero section renders with CTAs", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("This site ships itself.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Read the code" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Live metrics" })).toBeVisible();
  });

  test("Weekly Reads CTA navigates to /weekly", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "View Weekly Reads" }).click();

    await expect(page).toHaveURL("/weekly");
    await expect(page.getByRole("heading", { name: "Weekly Information Intake" })).toBeVisible();
  });

  test("skip-to-main link is present", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeAttached();
  });
});
