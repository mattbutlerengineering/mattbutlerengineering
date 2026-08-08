import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

// ThemeToggle's accessible name is "Switch to light/dark mode" (see
// packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx), not "theme".
const THEME_TOGGLE_NAME = /switch to (light|dark) mode/i;

test("theme toggle button exists", async ({ page }) => {
  const toggle = page.getByRole("button", { name: THEME_TOGGLE_NAME });
  await expect(toggle).toBeVisible();
});

test("clicking theme toggle changes the data-theme attribute", async ({ page }) => {
  const html = page.locator("html");
  const initialTheme = await html.getAttribute("data-theme");

  const toggle = page.getByRole("button", { name: THEME_TOGGLE_NAME });
  await toggle.click();

  const newTheme = await html.getAttribute("data-theme");
  expect(newTheme).not.toBe(initialTheme);
});

test("theme persists after navigation", async ({ page }) => {
  const html = page.locator("html");

  const toggle = page.getByRole("button", { name: THEME_TOGGLE_NAME });
  await toggle.click();
  const themeAfterToggle = await html.getAttribute("data-theme");

  await page.getByRole("link", { name: "Button" }).first().click();
  await page.waitForLoadState("networkidle");

  const themeAfterNav = await html.getAttribute("data-theme");
  expect(themeAfterNav).toBe(themeAfterToggle);
});
