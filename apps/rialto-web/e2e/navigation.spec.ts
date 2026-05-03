import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("sidebar shows category sections", async ({ page }) => {
  const sidebar = page.locator("nav");
  await expect(sidebar.getByText("Forms")).toBeVisible();
  await expect(sidebar.getByText("Navigation")).toBeVisible();
  await expect(sidebar.getByText("Feedback")).toBeVisible();
});

test("clicking a component link navigates to its page", async ({ page }) => {
  await page.getByRole("link", { name: "Button" }).first().click();
  await expect(page).toHaveURL(/\/components\/button/);
  await expect(page.getByRole("heading", { name: /button/i }).first()).toBeVisible();
});

test("navigating between categories works", async ({ page }) => {
  await page.getByRole("link", { name: "Input" }).first().click();
  await expect(page).toHaveURL(/\/components\/input/);

  await page.getByRole("link", { name: "Toggle" }).first().click();
  await expect(page).toHaveURL(/\/components\/toggle/);
});

test("sidebar highlights the active component", async ({ page }) => {
  await page.getByRole("link", { name: "Button" }).first().click();
  const activeLink = page.getByRole("link", { name: "Button" }).first();
  await expect(activeLink).toHaveAttribute("aria-current", "page");
});

test("overview page loads from root", async ({ page }) => {
  const heading = page.getByRole("heading").first();
  await expect(heading).toBeVisible();
});
