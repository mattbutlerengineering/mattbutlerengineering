import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("search input exists in sidebar", async ({ page }) => {
  const search = page.getByPlaceholder(/search|filter/i);
  await expect(search).toBeVisible();
});

test("typing in search filters sidebar links", async ({ page }) => {
  const search = page.getByPlaceholder(/search|filter/i);
  const nav = page.locator("nav");

  const linksBefore = await nav.getByRole("link").count();
  expect(linksBefore).toBeGreaterThan(5);

  await search.fill("button");
  await page.waitForTimeout(300);

  const linksAfter = await nav.getByRole("link").count();
  expect(linksAfter).toBeLessThan(linksBefore);
  await expect(nav.getByRole("link", { name: /button/i })).toBeVisible();
});

test("clearing search restores all links", async ({ page }) => {
  const search = page.getByPlaceholder(/search|filter/i);
  const nav = page.locator("nav");

  const initialCount = await nav.getByRole("link").count();

  await search.fill("button");
  await page.waitForTimeout(300);
  await search.clear();
  await page.waitForTimeout(300);

  const restoredCount = await nav.getByRole("link").count();
  expect(restoredCount).toBe(initialCount);
});
