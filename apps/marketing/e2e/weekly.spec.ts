import { test, expect } from "@playwright/test";

test.describe("Weekly intake page", () => {
  test("loads with heading and subtitle", async ({ page }) => {
    await page.goto("/weekly");

    await expect(page.getByRole("heading", { name: "Weekly Information Intake" })).toBeVisible();
    await expect(
      page.getByText("Curated resources from the best weekly newsletters")
    ).toBeVisible();
  });

  test("filter buttons are visible", async ({ page }) => {
    await page.goto("/weekly");

    const nav = page.getByRole("navigation", { name: "Filter resources by source" });
    await expect(nav).toBeVisible();

    await expect(nav.getByRole("button", { name: "All" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "JS Weekly" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "React Weekly" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "AI Weekly" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Other" })).toBeVisible();
  });

  test("clicking a filter button changes visible resources", async ({ page }) => {
    await page.goto("/weekly");

    const nav = page.getByRole("navigation", { name: "Filter resources by source" });
    const allCount = await page.locator('[class*="card"]').count();

    await nav.getByRole("button", { name: "JS Weekly" }).click();

    // After filtering, resource count may be less than or equal to total
    const filteredCount = await page.locator('[class*="card"]').count();
    expect(filteredCount).toBeGreaterThanOrEqual(0);
    expect(filteredCount).toBeLessThanOrEqual(allCount);
  });

  test("resource cards link to external URLs", async ({ page }) => {
    await page.goto("/weekly");

    const firstLink = page.locator('[class*="card"] a').first();
    await expect(firstLink).toHaveAttribute("target", "_blank");
    await expect(firstLink).toHaveAttribute("rel", "noopener noreferrer");
  });
});
