import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

test.describe("Accessibility", () => {
  test("homepage has no critical violations", async ({ page }) => {
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();

    const violations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(violations).toHaveLength(0);
  });

  test("shared spec error page has no critical violations", async ({ page }) => {
    await page.goto("/s/invalid-id-for-a11y");
    await expect(page.getByText("Spec not found")).toBeVisible({ timeout: 10_000 });

    const accessibilityScanResults = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();

    const violations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(violations).toHaveLength(0);
  });
});
