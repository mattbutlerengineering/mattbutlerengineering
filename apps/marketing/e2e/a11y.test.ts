import { test, expect } from "@playwright/test";
import { injectAxe } from "@axe-core/playwright";

test.describe("Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await injectAxe(page);
  });

  test("homepage has no critical violations", async ({ page }) => {
    const violations: string[] = [];

    await page.goto("/");

    await page.evaluate(() => {
      // @ts-expect-error - axe is injected
      window.axe.run(window.document, { runOnly: { type: "tag", values: ["wcag2aa"] } }).then((result: { violations: { impact: string; id: string }[] }) => {
        result.violations.forEach((v) => {
          if (v.impact === "critical" || v.impact === "serious") {
            violations.push(`${v.id}: ${v.impact}`);
          }
        });
      });
    });

    expect(violations).toHaveLength(0);
  });
});
