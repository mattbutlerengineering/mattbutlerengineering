import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("hero section renders with CTAs", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("This site ships itself.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Read the code" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Live metrics" })).toBeVisible();
  });

  test("retired /weekly page redirects to the homepage", async ({ page }) => {
    await page.goto("/weekly");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Read the code" })).toBeVisible();
  });

  test("Recently shipped link opens a story and back to the index", async ({ page }) => {
    await page.goto("/");

    const shipped = page.getByRole("heading", { name: "Recently shipped" }).locator("..");
    await shipped.getByRole("link").first().click();

    await expect(page).toHaveURL(/\/shipped\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page
      .getByRole("link", { name: /shipped/i })
      .first()
      .click();
    await expect(page).toHaveURL("/shipped");
  });

  test("skip-to-main link is present", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeAttached();
  });

  test("first Tab on a fresh load focuses the skip link, and footer links come after the header", async ({
    page,
  }) => {
    await page.goto("/");
    // The loaded page, not the skeleton: focusing <main> after the fallback
    // clears would make this first Tab a link inside main.
    await expect(page.locator("#main-content:not(:has([data-route-fallback]))")).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();

    const seen: string[] = [];
    for (let stop = 0; stop < 40; stop += 1) {
      await page.keyboard.press("Tab");
      const region = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) return "body";
        // The footer has its own <nav>, so the footer check has to win.
        if (el.closest("footer")) return "footer";
        if (el.closest("nav")) return "nav";
        if (el.closest("main")) return "main";
        return "other";
      });
      seen.push(region);
      if (region === "footer") break;
    }

    const headerAt = seen.indexOf("nav");
    const footerAt = seen.indexOf("footer");
    expect(headerAt).toBeGreaterThanOrEqual(0);
    expect(footerAt).toBeGreaterThan(headerAt);
  });

  test("skip link moves focus to main content", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#main-content:not(:has([data-route-fallback]))")).toBeVisible();

    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("client-side navigation moves focus to main content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Live metrics" })).toBeVisible();

    await page.getByRole("link", { name: "Live metrics" }).click();
    await expect(page).toHaveURL("/metrics");
    await expect(page.locator("#main-content")).toBeFocused();
  });
});
