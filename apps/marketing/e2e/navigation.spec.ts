import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("hero section renders with CTAs", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("This site ships itself.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Read the code" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Live metrics" })).toBeVisible();
  });

  test("reading section is absent while the weekly intake has nothing recent", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /what i.m reading/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Browse the stack" })).toHaveCount(0);
  });

  test("weekly intake page renders", async ({ page }) => {
    await page.goto("/weekly");

    await expect(page.getByRole("heading", { name: "Weekly Information Intake" })).toBeVisible();
  });

  test("Recently shipped link opens a story and back to the index", async ({ page }) => {
    await page.goto("/");

    const shipped = page.getByRole("heading", { name: "Recently shipped" }).locator("..");
    await shipped.getByRole("link").first().click();

    await expect(page).toHaveURL(/\/shipped\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page
      .getByRole("link", { name: /shipped/i })
      .first()
      .click();
    await expect(page).toHaveURL("/shipped");
  });

  test("skip-to-main link is present", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeAttached();
  });
});
