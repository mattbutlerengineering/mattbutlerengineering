import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { WCAG_A_AA_TAGS } from "./axe-tags.js";

test.describe("Accessibility", () => {
  test("homepage has no critical violations", async ({ page }) => {
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(WCAG_A_AA_TAGS)
      .analyze();

    const violations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(violations).toHaveLength(0);
  });
});
