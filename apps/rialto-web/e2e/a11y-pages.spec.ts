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
  { name: "Guest Profile", path: "/examples/guest-profile" },
  { name: "Error 403", path: "/examples/error-403" },
  { name: "Error 404", path: "/examples/error-404" },
  { name: "Error 500", path: "/examples/error-500" },
  { name: "Booking Confirmed", path: "/examples/booking-confirmed" },
  { name: "Booking Failed", path: "/examples/booking-failed" },
  { name: "Pricing Table", path: "/examples/pricing-table" },
  { name: "Motion", path: "/components/motion" },
  { name: "Spacing", path: "/components/spacing" },
  { name: "Radius", path: "/components/radius" },
  { name: "Shadows", path: "/components/shadows" },
  { name: "Icon Vocabulary", path: "/components/icon-vocabulary" },
  { name: "Command Palette", path: "/examples/command-palette" },
  { name: "Onboarding", path: "/examples/onboarding" },
  { name: "Notification Center", path: "/examples/notification-center" },
  { name: "Invoice", path: "/examples/invoice" },
  { name: "Checkout", path: "/examples/checkout" },
  { name: "Telemetry HUD", path: "/demos/telemetry?frozen=1" },
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

// Colour contrast stays enabled here: the ui-quality loop's axe-serious tell
// (#6300) caught SegmentedControl and TapeChart bar text below 4.5:1, which the
// blanket color-contrast opt-out above cannot see.
test("a11y: Tape Chart page has no serious axe violations (including contrast)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("components/tape-chart");
  await page.waitForLoadState("networkidle");

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );

  expect(
    serious,
    `Tape Chart page has ${serious.length} critical/serious a11y violations:\n${serious.map((v) => `  - ${v.id} (${v.nodes.length} instances)`).join("\n")}`
  ).toHaveLength(0);
});

// Iteration 6 (#6715): component showcase pages the ui-quality loop kept
// flagging axe-serious/-moderate. Full rule set (colour contrast and landmark
// uniqueness included), both themes, any impact level fails.
const ITERATION_6_PAGES = [
  "aspect-ratio",
  "avatar",
  "breadcrumb",
  "data-list",
  "dialog",
  "divider",
  "drawer",
  "dropdown-menu",
  "pagination",
  "scroll-area",
];

for (const scheme of ["light", "dark"] as const) {
  for (const slug of ITERATION_6_PAGES) {
    test(`a11y: ${slug} page has zero axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
      await page.goto(`components/${slug}`);
      await page.waitForLoadState("networkidle");
      // Without this the dark arm would silently audit the light theme if the
      // colorScheme -> data-theme pipeline ever regressed.
      await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);

      const { violations } = await new AxeBuilder({ page }).analyze();

      expect(
        violations,
        `${slug} (${scheme}) has ${violations.length} axe violations:\n${violations.map((v) => `  - ${v.id} [${v.impact}] (${v.nodes.length} instances)`).join("\n")}`
      ).toHaveLength(0);
    });
  }
}

// Iteration 7 (#7190): example and standalone pages whose seed findings are
// fixed (or no longer reproduce). Full rule set, both themes, any impact fails.
// Iteration 8 (#7405) added reservation-kanban, reservation-timeline and
// visual-test once their deferred TapeChart/ghost-button/Tag findings landed.
const ITERATION_7_PAGES = [
  "examples/checkout",
  "examples/form",
  "examples/notification-center",
  "examples/onboarding",
  "examples/pricing-table",
  "examples/reservations",
  "examples/reservation-kanban",
  "examples/reservation-timeline",
  "examples/settings",
  "demos/signup",
  "privacy",
  "visual-test",
];

for (const scheme of ["light", "dark"] as const) {
  for (const path of ITERATION_7_PAGES) {
    test(`a11y: ${path} page has zero axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);

      const { violations } = await new AxeBuilder({ page }).analyze();

      expect(
        violations,
        `${path} (${scheme}) has ${violations.length} axe violations:\n${violations.map((v) => `  - ${v.id} [${v.impact}] (${v.nodes.length} instances)`).join("\n")}`
      ).toHaveLength(0);
    });
  }
}
