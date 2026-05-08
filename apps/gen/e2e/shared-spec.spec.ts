import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

test.describe("Shared Spec", () => {
  test("shows not found state for unknown ID", async ({ page }) => {
    await page.goto("/s/invalid-id-that-does-not-exist");
    await expect(page.getByText("Spec not found")).toBeVisible({ timeout: 10_000 });
  });

  test("shows Back to Gen Playground button in error state", async ({ page }) => {
    await page.goto("/s/invalid-id-that-does-not-exist");
    await expect(page.getByRole("button", { name: "Back to Gen Playground" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("route is public — no Sign In prompt shown", async ({ page }) => {
    await page.goto("/s/any-id");
    // Shared spec bypasses auth gating; the login prompt must not appear
    await expect(page.getByRole("button", { name: "Sign In" })).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("error page has no critical a11y violations", async ({ page }) => {
    await page.goto("/s/invalid-id-for-a11y");
    await expect(page.getByText("Spec not found")).toBeVisible({ timeout: 10_000 });
    const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
    const violations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(violations).toHaveLength(0);
  });
});
