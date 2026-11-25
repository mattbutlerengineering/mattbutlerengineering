import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 375px light-mode component demos. Confirmed on the live site:
 * the right-aligned dropdown opened at x=-29, navigation labels and the
 * Configuration panel ran past the viewport, and pagination's next button
 * sat past the column with no visible way to reach it.
 */

const THEME_KEY = "mbe-theme-preference";

async function openDemo(page: Page, path: string, width: number) {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "light");
    localStorage.setItem(
      "rialto-cookie-consent",
      JSON.stringify({
        consented: true,
        preferences: { essential: true, analytics: true, functional: true, marketing: true },
      })
    );
  }, THEME_KEY);
  await page.setViewportSize({ width, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() => document.fonts.ready);
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

test.describe("narrow overlay and navigation demos", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("right-aligned dropdown stays inside the 375px viewport", async ({ page }) => {
    await openDemo(page, "components/dropdown-menu", 375);
    const trigger = page.getByRole("button", { name: "Right-aligned" });
    await trigger.focus();
    await trigger.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: /Settings/ })).toBeVisible();

    const menuBox = await box(menu);
    const settings = await box(menu.getByRole("menuitem", { name: /Settings/ }));
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(375);
    expect(settings.x).toBeGreaterThanOrEqual(menuBox.x - 1);
    expect(settings.x + settings.width).toBeLessThanOrEqual(menuBox.x + menuBox.width + 1);
  });

  test("navigation labels and the open panel stay inside the 375px viewport", async ({ page }) => {
    await openDemo(page, "components/navigation-menu", 375);

    const basic = page.getByRole("navigation", { name: "Basic navigation" });
    const basicBox = await box(basic);
    for (const name of ["Dashboard", "About"]) {
      const item = await box(basic.getByRole("link", { name, exact: true }));
      expect(item.x).toBeGreaterThanOrEqual(basicBox.x - 1);
      expect(item.x + item.width).toBeLessThanOrEqual(basicBox.x + basicBox.width + 1);
    }
    for (const name of ["Telemetry", "Configuration"]) {
      const item = await box(basic.getByRole("button", { name }));
      expect(item.x).toBeGreaterThanOrEqual(basicBox.x - 1);
      expect(item.x + item.width).toBeLessThanOrEqual(basicBox.x + basicBox.width + 1);
    }

    const grouped = page.getByRole("navigation", { name: "Grouped dropdown navigation" });
    const groupedBox = await box(grouped);
    const github = await box(grouped.getByRole("link", { name: "GitHub" }));
    expect(github.x + github.width).toBeLessThanOrEqual(groupedBox.x + groupedBox.width + 1);

    await grouped.getByRole("button", { name: "Resources" }).click();
    const panel = page.getByRole("menu");
    await expect(panel.getByRole("menuitem", { name: "Documentation" })).toBeVisible();
    const panelBox = await box(panel);
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(375);

    const usage = page.getByRole("navigation", { name: "Usage example navigation" });
    const usageBox = await box(usage);
    const tokens = await box(usage.getByRole("link", { name: "Tokens" }));
    expect(tokens.x + tokens.width).toBeLessThanOrEqual(usageBox.x + usageBox.width + 1);
    expect(usageBox.x + usageBox.width).toBeLessThanOrEqual(375);
  });

  test("pagination controls are fully inside the column at 375px", async ({ page }) => {
    await openDemo(page, "components/pagination", 375);

    for (const name of [
      "Large range with ellipsis pagination",
      "Very large range pagination",
      "Usage example pagination",
    ]) {
      const nav = page.getByRole("navigation", { name });
      const navBox = await box(nav);
      expect(navBox.x).toBeGreaterThanOrEqual(0);
      expect(navBox.x + navBox.width).toBeLessThanOrEqual(375);
      const buttons = nav.getByRole("button");
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const control = await box(buttons.nth(i));
        expect(control.x).toBeGreaterThanOrEqual(navBox.x - 1);
        expect(control.x + control.width).toBeLessThanOrEqual(navBox.x + navBox.width + 1);
      }
    }

    const main = page.locator("#main-content");
    const overflow = await main.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("desktop layouts stay on one row", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("pagination keeps the sibling window and the nav stays one line", async ({ page }) => {
    await openDemo(page, "components/pagination", 1280);
    const large = page.getByRole("navigation", { name: "Large range with ellipsis pagination" });
    await expect(large).not.toHaveAttribute("data-overflowing", "true");
    await expect(large.getByRole("button", { name: "Page 6" })).toBeVisible();
    await expect(large.getByRole("button", { name: "Page 8" })).toBeVisible();
    const six = await box(large.getByRole("button", { name: "Page 6" }));
    const eight = await box(large.getByRole("button", { name: "Page 8" }));
    expect(Math.abs(six.y - eight.y)).toBeLessThanOrEqual(2);

    await openDemo(page, "components/navigation-menu", 1280);
    const basic = page.getByRole("navigation", { name: "Basic navigation" });
    const dashboard = await box(basic.getByRole("link", { name: "Dashboard" }));
    const about = await box(basic.getByRole("link", { name: "About" }));
    expect(Math.abs(dashboard.y - about.y)).toBeLessThanOrEqual(2);

    await openDemo(page, "components/dropdown-menu", 1280);
    const trigger = page.getByRole("button", { name: "Right-aligned" });
    await trigger.focus();
    await trigger.press("Enter");
    const menu = page.getByRole("menu");
    const triggerBox = await box(trigger);
    const menuBox = await box(menu);
    expect(
      Math.abs(menuBox.x + menuBox.width - (triggerBox.x + triggerBox.width))
    ).toBeLessThanOrEqual(2);
  });
});
