import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES_TO_AUDIT = [
  { name: "Button", path: "/components/button" },
  { name: "Input", path: "/components/input" },
  { name: "Toggle", path: "/components/toggle" },
  { name: "Select", path: "/components/select" },
  { name: "Tabs", path: "/components/tabs" },
  { name: "Dialog", path: "/components/dialog" },
  { name: "Badge", path: "/components/badge" },
];

for (const { name, path } of PAGES_TO_AUDIT) {
  test(`a11y: ${name} page has no critical violations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(
      critical,
      `${name} page has ${critical.length} critical/serious a11y violations:\n${critical.map((v) => `  - ${v.id}: ${v.description} (${v.nodes.length} instances)`).join("\n")}`
    ).toHaveLength(0);
  });
}
