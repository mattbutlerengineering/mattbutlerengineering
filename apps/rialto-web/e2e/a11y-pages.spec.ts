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
  { name: "Error 403", path: "/examples/error-403" },
  { name: "Error 404", path: "/examples/error-404" },
  { name: "Error 500", path: "/examples/error-500" },
];

for (const { name, path } of PAGES_TO_AUDIT) {
  test(`a11y: ${name} page has no critical violations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Relative navigation — an absolute path would drop the /rialto/ base
    // from the configured baseURL and audit the dev server's hint page.
    await page.goto(path.replace(/^\//, ""));
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(
      critical,
      `${name} page has ${critical.length} critical/serious a11y violations:\n${critical.map((v) => `  - ${v.id}: ${v.description} (${v.nodes.length} instances)`).join("\n")}`
    ).toHaveLength(0);
  });
}
