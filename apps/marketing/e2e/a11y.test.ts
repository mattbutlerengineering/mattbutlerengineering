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

  // The ui-quality loop runs axe with no tag filter (packages/test-fixtures
  // ui-quality-capture.ts), so these cover its rules, not just wcag2aa.
  for (const route of ["/", "/acmm", "/ai-health", "/metrics", "/status"]) {
    test(`${route} has no serious or critical axe violations`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page }).analyze();
      const violations = results.violations
        .filter((v) => v.impact === "critical" || v.impact === "serious")
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

      expect(violations).toEqual([]);
    });
  }
});
