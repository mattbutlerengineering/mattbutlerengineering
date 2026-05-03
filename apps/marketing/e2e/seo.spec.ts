import { test, expect } from "@playwright/test";

test.describe("SEO metadata", () => {
  test("homepage has correct title and meta tags", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Matt Butler Engineering");

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /Matt Butler Engineering/);

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /Matt Butler Engineering/);

    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "website");
  });

  test("homepage has canonical link", async ({ page }) => {
    await page.goto("/");

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", /mattbutlerengineering\.com/);
  });

  test("status page has base title", async ({ page }) => {
    await page.goto("/status");

    await expect(page).toHaveTitle("Matt Butler Engineering");
  });

  test("weekly page has base title", async ({ page }) => {
    await page.goto("/weekly");

    await expect(page).toHaveTitle("Matt Butler Engineering");
  });

  test("404 page sets page-not-found title", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");

    await expect(page).toHaveTitle("Page not found — Matt Butler Engineering");
  });
});
