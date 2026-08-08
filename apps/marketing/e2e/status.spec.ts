import { test, expect } from "@playwright/test";

test.describe("Status page", () => {
  test("loads with System Status heading", async ({ page }) => {
    await page.goto("/status");

    await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  });

  test("shows API Services section with expected services", async ({ page }) => {
    await page.goto("/status");

    await expect(page.getByRole("heading", { name: "API Services" })).toBeVisible();
    await expect(page.getByText("Users API")).toBeVisible();
    await expect(page.getByText("Reservations API")).toBeVisible();
    await expect(page.getByText("Agent API")).toBeVisible();
  });

  test("shows Static Sites section with expected sites", async ({ page }) => {
    await page.goto("/status");

    await expect(page.getByRole("heading", { name: "Static Sites" })).toBeVisible();
    // Scoped to #main-content: "Hospitality" also appears in nav/footer links
    // outside main, which collide with an unscoped getByText in strict mode.
    const main = page.locator("#main-content");
    await expect(main.getByText("Marketing", { exact: true })).toBeVisible();
    await expect(main.getByText("Hospitality", { exact: true })).toBeVisible();
    await expect(main.getByText("Rialto", { exact: true })).toBeVisible();
  });

  test("shows overall status badge on load", async ({ page }) => {
    await page.goto("/status");

    // Badge shows either Checking... (loading) or a resolved state
    const badge = page.locator('[class*="badge"]').first();
    await expect(badge).toBeVisible();
  });
});
