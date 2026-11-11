import { test, expect } from "@playwright/test";

/**
 * GlobalNav links are full document loads. Chrome can freeze the page that
 * had the menu open and restore that frozen document on Back. These tests
 * cover that return, plus a persisted `pageshow` for the case where the
 * back-forward cache hands the open menu back (Playwright's own protocol
 * session often blocks the cache, so the event is dispatched directly).
 */
test.describe("mobile header menu and browser Back", () => {
  test.use({
    viewport: { width: 375, height: 800 },
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("mbe-theme-preference", "dark");
    });
    await page.emulateMedia({ colorScheme: "dark" });
  });

  test("closes after a menu link and browser Back, and stays closed going forward", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "This site ships itself." })).toBeVisible();

    await page.getByRole("button", { name: "Open menu" }).click();
    const nav = page.getByRole("navigation", { name: "Global navigation" });
    const metrics = nav.getByRole("link", { name: "Metrics", exact: true });
    await expect(metrics).toBeVisible();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    await metrics.click();
    await expect(page).toHaveURL(/\/metrics$/);
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    await page.goBack();
    await expect(page).toHaveURL("/");
    const toggle = page.getByRole("button", { name: "Open menu" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-label", "Open menu");
    await expect(metrics).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "This site ships itself." })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/metrics$/);
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-label",
      "Open menu"
    );
  });

  test("a persisted pageshow closes an open menu and keeps the button name in sync", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    const toggle = page.getByRole("button", { name: "Open menu" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-label", "Open menu");
    await expect(
      page
        .getByRole("navigation", { name: "Global navigation" })
        .getByRole("link", { name: "Metrics", exact: true })
    ).toHaveCount(0);

    await toggle.click();
    const close = page.getByRole("button", { name: "Close menu" });
    await expect(close).toHaveAttribute("aria-expanded", "true");
    await close.press("Escape");
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });
});
