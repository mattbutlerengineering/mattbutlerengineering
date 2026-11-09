import { test, expect } from "@playwright/test";

const ORIGIN = "https://mattbutlerengineering.com";
const HOME_TITLE = "Matt Butler Engineering";

const INDEXABLE_ROUTES: readonly { readonly path: string; readonly title: string }[] = [
  { path: "/status", title: "System Status — Matt Butler Engineering" },
  { path: "/weekly", title: "Weekly Information Intake — Matt Butler Engineering" },
  { path: "/metrics", title: "Quality Metrics — Matt Butler Engineering" },
  { path: "/acmm", title: "ACMM Dashboard — Matt Butler Engineering" },
  { path: "/ai-health", title: "AI Health Dashboard — Matt Butler Engineering" },
  { path: "/shipped", title: "Shipped by the Factory — Matt Butler Engineering" },
];

test.describe("SEO metadata", () => {
  test("homepage has correct title and meta tags", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(HOME_TITLE);

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /Matt Butler Engineering/);

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", HOME_TITLE);

    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "website");

    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", ORIGIN);
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute("content", HOME_TITLE);
  });

  test("homepage has canonical link", async ({ page }) => {
    await page.goto("/");

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", `${ORIGIN}/`);
  });

  test("status page has its own title", async ({ page }) => {
    await page.goto("/status");

    await expect(page).toHaveTitle("System Status — Matt Butler Engineering");
  });

  test("weekly page has its own title", async ({ page }) => {
    await page.goto("/weekly");

    await expect(page).toHaveTitle("Weekly Information Intake — Matt Butler Engineering");
  });

  test("404 page sets page-not-found title", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");

    await expect(page).toHaveTitle("Page not found — Matt Butler Engineering");
  });

  for (const route of INDEXABLE_ROUTES) {
    test(`${route.path} canonical and social tags match the route`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page).toHaveTitle(route.title);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `${ORIGIN}${route.path}`
      );
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
        "content",
        `${ORIGIN}${route.path}`
      );
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        "content",
        route.title
      );
      await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
        "content",
        route.title
      );

      const description = await page.locator('meta[name="description"]').getAttribute("content");
      expect(description).toBeTruthy();
      await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
        "content",
        description ?? ""
      );
      await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute(
        "content",
        description ?? ""
      );
    });
  }

  test("client-side navigation updates canonical and social tags, then restores home", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}/`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", ORIGIN);

    await page.getByRole("link", { name: "Live metrics" }).click();
    await expect(page).toHaveURL(/\/metrics$/);
    await expect(page).toHaveTitle("Quality Metrics — Matt Butler Engineering");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${ORIGIN}/metrics`
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      `${ORIGIN}/metrics`
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Quality Metrics — Matt Butler Engineering"
    );
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
      "content",
      "Quality Metrics — Matt Butler Engineering"
    );

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle(HOME_TITLE);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}/`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", ORIGIN);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", HOME_TITLE);
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute("content", HOME_TITLE);
  });

  test("client-side navigation to a shipped story uses that story url", async ({ page }) => {
    await page.goto("/shipped");
    const story = page.locator("main a[href^='/shipped/']").first();
    const href = await story.getAttribute("href");
    expect(href).toMatch(/^\/shipped\/[^/]+$/);
    await story.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page).toHaveTitle("Shipped Story — Matt Butler Engineering");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}${href}`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      `${ORIGIN}${href}`
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Shipped Story — Matt Butler Engineering"
    );
  });

  test("404 is noindex and does not canonicalize to the homepage", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");

    await expect(page).toHaveTitle("Page not found — Matt Butler Engineering");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Page not found — Matt Butler Engineering"
    );

    await page.getByRole("link", { name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle(HOME_TITLE);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}/`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", ORIGIN);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  });
});
