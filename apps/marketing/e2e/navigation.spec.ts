import { test, expect, type Page } from "@playwright/test";

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

/** `global.css` sets `scroll-behavior: smooth`, which would animate a bare scrollTo. */
async function scrollTo(page: Page, top: number): Promise<number> {
  return page.evaluate((y) => {
    window.scrollTo({ top: y, left: 0, behavior: "instant" });
    return window.scrollY;
  }, top);
}

test.describe("scroll position on navigation", () => {
  test("skip link still anchors to #main-content after the page is scrolled", async ({ page }) => {
    await page.goto("/shipped");
    await expect(page.locator("#main-content:not(:has([data-route-fallback]))")).toBeVisible();
    const offset = await scrollTo(page, 900);
    expect(offset).toBeGreaterThan(700);

    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/shipped#main-content$/);
    await expect(page.locator("#main-content")).toBeFocused();
    // Native hash alignment puts <main> at the viewport top. A route-change
    // scrollTo(0) would leave it below the sticky nav instead.
    await expect
      .poll(() => page.locator("#main-content").evaluate((el) => el.getBoundingClientRect().top))
      .toBeLessThan(24);
  });

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`a shipped story opens at the top (${reducedMotion}) and Back/Forward restore scroll`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await page.goto("/shipped");
      await expect(page.getByRole("heading", { name: "Shipped by the factory" })).toBeVisible();

      const listOffset = await scrollTo(page, 1100);
      expect(listOffset).toBeGreaterThan(700);

      const href = await page.evaluate(() => {
        const link = [...document.querySelectorAll("main a[href^='/shipped/']")].find((anchor) => {
          const box = anchor.getBoundingClientRect();
          return box.top >= 80 && box.bottom <= window.innerHeight;
        });
        return link?.getAttribute("href") ?? null;
      });
      expect(href).toMatch(/^\/shipped\/[^/]+$/);

      await page.locator(`main a[href="${href}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      const title = await page.getByRole("heading", { level: 1 }).boundingBox();
      expect(title).not.toBeNull();
      expect(title!.y).toBeGreaterThanOrEqual(0);
      expect(title!.y).toBeLessThan(320);

      await page.goBack();
      await expect(page).toHaveURL(/\/shipped$/);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(listOffset);

      await page.goForward();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    });
  }

  test("homepage client-side links open the next page at the top", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Live metrics" })).toBeVisible();

    const metricsOffset = await page.evaluate(() => {
      const link = [...document.querySelectorAll("a")].find(
        (anchor) => anchor.textContent?.trim() === "Live metrics"
      );
      if (!link) return -1;
      const top = link.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, top - 80), left: 0, behavior: "instant" });
      return window.scrollY;
    });
    expect(metricsOffset).toBeGreaterThan(100);
    await page.getByRole("link", { name: "Live metrics" }).click();
    await expect(page).toHaveURL("/metrics");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();

    await page.goto("/");
    const story = page.locator("main a[href^='/shipped/']").first();
    await expect(story).toBeAttached();
    const storyOffset = await story.evaluate((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top, left: 0, behavior: "instant" });
      return window.scrollY;
    });
    expect(storyOffset).toBeGreaterThan(400);
    await story.click();
    await expect(page).toHaveURL(/\/shipped\/[^/]+$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  });

  test("engineering menu document loads open at the top", async ({ page }) => {
    // GlobalNav and the footer use full <a href> loads, not React Router
    // <Link>. A new document already starts at the top; this locks that.
    for (const name of ["Metrics", "Status", "AI health", "ACMM"]) {
      await page.goto("/shipped");
      await expect(page.getByRole("heading", { name: "Shipped by the factory" })).toBeVisible();
      const offset = await scrollTo(page, 900);
      expect(offset).toBeGreaterThan(700);

      const nav = page.getByRole("navigation", { name: "Global navigation" });
      await nav.getByRole("button", { name: "Engineering" }).click();
      await nav.getByRole("link", { name, exact: true }).click();

      await expect(page).not.toHaveURL(/\/shipped/);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    }
  });
});
