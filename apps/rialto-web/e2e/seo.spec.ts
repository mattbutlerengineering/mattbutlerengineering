import { test, expect, type Page } from "@playwright/test";

const ORIGIN = "https://mattbutlerengineering.com";
const HOME_TITLE = "Rialto — Design System";
const HOME_SOCIAL_TITLE = "Rialto Design System";

const PAGES: readonly {
  readonly path: string;
  readonly title: string;
  readonly heading: string;
}[] = [
  { path: "/rialto/components/accordion", title: "Accordion — Rialto", heading: "Accordion" },
  { path: "/rialto/components/dialog", title: "Dialog — Rialto", heading: "Dialog" },
  { path: "/rialto/examples/invoice", title: "Invoice — Rialto", heading: "Invoice" },
  { path: "/rialto/examples/checkout", title: "Checkout — Rialto", heading: "Checkout" },
  { path: "/rialto/examples/dashboard", title: "Dashboard — Rialto", heading: "Dashboard" },
  {
    path: "/rialto/demos/login",
    title: "Sign In — Rialto",
    heading: "Sign in to your account",
  },
];

async function expectHead(page: Page, path: string, title: string): Promise<void> {
  const url = `${ORIGIN}${path}`;
  const social = path === "/rialto/" ? HOME_SOCIAL_TITLE : title;
  await expect(page).toHaveTitle(title);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", url);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", url);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", social);
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute("content", social);
}

test("home keeps the shell canonical and the distinct social title", async ({ page }) => {
  await page.goto("/rialto/");
  await expect(page).toHaveTitle(HOME_TITLE);
  await expectHead(page, "/rialto/", HOME_TITLE);
});

for (const route of PAGES) {
  test(`${route.path} has its own title, canonical and social url`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expectHead(page, route.path, route.title);
  });
}

test("client navigation retargets canonical and social tags, then restores home", async ({
  page,
}) => {
  await page.goto("/rialto/");
  await expectHead(page, "/rialto/", HOME_TITLE);

  await page.getByRole("link", { name: "Invoice", exact: true }).click();
  await expect(page).toHaveURL(/\/examples\/invoice$/);
  await expect(page.getByRole("heading", { level: 1, name: "Invoice" })).toBeVisible();
  await expectHead(page, "/rialto/examples/invoice", "Invoice — Rialto");

  await page.getByRole("link", { name: "Button", exact: true }).click();
  await expect(page).toHaveURL(/\/components\/button$/);
  await expect(page.getByRole("heading", { level: 1, name: "Button" })).toBeVisible();
  await expectHead(page, "/rialto/components/button", "Button — Rialto");

  await page.goBack();
  await expect(page).toHaveURL(/\/examples\/invoice$/);
  await expectHead(page, "/rialto/examples/invoice", "Invoice — Rialto");

  await page.goBack();
  await expect(page).toHaveURL(/\/rialto\/?$/);
  await expectHead(page, "/rialto/", HOME_TITLE);
});

test("theme-color tags stay in the head across a route change", async ({ page }) => {
  await page.goto("/rialto/examples/invoice");
  await page.getByRole("link", { name: "Button", exact: true }).click();
  await expect(page).toHaveURL(/\/components\/button$/);

  const metas = page.locator('meta[name="theme-color"]');
  await expect(metas).toHaveCount(2);
  await expect(metas.nth(0)).toHaveAttribute("media", "(prefers-color-scheme: light)");
  await expect(metas.nth(1)).toHaveAttribute("media", "(prefers-color-scheme: dark)");
});
