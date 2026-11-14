import { test, expect } from "@playwright/test";

// Regression coverage for #3939: the floating demo controls (theme, RTL,
// cookie prefs, vibe select) used to sit in a higher stacking context than
// GlobalNav's sticky bar and physically overlapped the "MBE" brand link,
// making it unclickable on every /demos/* page. `.click()` + URL assertion
// (not `toBeVisible()`) proves the brand link actually receives the
// hit-test rather than merely existing in the DOM underneath the controls.

const VIEWPORTS = [
  { width: 375, height: 667, label: "375px" },
  { width: 768, height: 1024, label: "768px" },
  { width: 1440, height: 900, label: "1440px" },
];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const { width, height, label } of VIEWPORTS) {
  test(`brand link is clickable and navigates to / at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("demos/login");
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "MBE" }).click();
    await expect(page).toHaveURL(/\/rialto\/$/);
  });
}

test("brand link remains clickable when switched to RTL", async ({ page }) => {
  await page.goto("demos/login");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Switch to RTL").click();
  await expect(page.locator("[dir='rtl']")).toBeVisible();

  await page.getByRole("link", { name: "MBE" }).click();
  await expect(page).toHaveURL(/\/rialto\/$/);
});

test("mobile hamburger menu link is clickable through the floating controls at 375px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("demos/login");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/rialto\/$/);
});

// Regression coverage for #3975: the #3954 fix scoped pointer-events:none
// to "any open button[aria-expanded][aria-controls]" — a generic ARIA
// pattern several rialto components share (Select, Collapsible,
// Autocomplete, Combobox, CommandPalette, MasterOverride). That silently
// killed the floating controls whenever any of those was open elsewhere
// on the page, not just GlobalNav's hamburger.
test("floating controls remain clickable when an unrelated Collapsible is open at 375px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  // Pre-consent so the fixed-position cookie banner (unrelated to this
  // regression) doesn't overlap the Collapsible trigger at this viewport.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "rialto-cookie-consent",
      JSON.stringify({
        consented: true,
        preferences: { essential: true, analytics: true, functional: true, marketing: true },
      })
    );
  });
  await page.goto("demos/drivers/new");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Additional Details" }).click();

  const controls = page.getByTestId("demo-floating-controls");
  const themeToggle = controls.getByLabel(/switch to (dark|light) mode/i);
  await themeToggle.click();
  await expect(themeToggle).toBeVisible();
});

// The fixed controls sit at y=80–116, over the start of a demo page. A
// PageHeader breadcrumb used to begin at y=97, so the bar covered "Home >
// Telemetry > Dashboard" and stole its hit target. DriverLayout, the demos
// index, and the auth-flow title only cleared that band by a few pixels.
function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapX > 0 && overlapY > 0;
}

const CLEARANCE_PAGES = [
  { path: "demos/dashboard", kind: "breadcrumb" },
  { path: "demos/layouts", kind: "breadcrumb" },
  { path: "demos/drivers", kind: "breadcrumb" },
  { path: "demos/teams/new", kind: "breadcrumb" },
  { path: "demos/auth-flow", kind: "heading" },
  // `/demos` itself is not listed: the index renders inside ShowcaseLayout
  // (#8641), which has no floating demo controls to clear.
] as const;

for (const viewport of [
  { width: 768, height: 1024, label: "768" },
  { width: 375, height: 812, label: "375" },
  { width: 1280, height: 800, label: "1280" },
]) {
  for (const { path, kind } of CLEARANCE_PAGES) {
    test(`floating controls do not cover the ${path} ${kind} at ${viewport.label}px`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        localStorage.setItem("mbe-theme-preference", "dark");
        localStorage.setItem(
          "rialto-cookie-consent",
          JSON.stringify({
            consented: true,
            preferences: { essential: true, analytics: true, functional: true, marketing: true },
          })
        );
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);

      const controls = page.getByTestId("demo-floating-controls");
      const target =
        kind === "breadcrumb"
          ? page.getByRole("navigation", { name: /breadcrumb/i })
          : page.getByRole("heading", { level: 1 });
      const controlsBox = await controls.boundingBox();
      const targetBox = await target.boundingBox();
      expect(controlsBox).not.toBeNull();
      expect(targetBox).not.toBeNull();
      expect(boxesOverlap(controlsBox!, targetBox!)).toBe(false);

      // The first glyph, not the padding box: a negative-margin breadcrumb
      // link can stick out above the nav.
      const hit = await target.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const x = rect.left + Math.min(24, rect.width / 2);
        const y = rect.top + Math.min(8, rect.height / 2);
        const top = document.elementFromPoint(x, y);
        return top === el || Boolean(el.contains(top));
      });
      expect(hit).toBe(true);
    });
  }
}

test("floating controls do not cover the dashboard breadcrumb in RTL", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "rialto-cookie-consent",
      JSON.stringify({
        consented: true,
        preferences: { essential: true, analytics: true, functional: true, marketing: true },
      })
    );
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("demos/dashboard");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Switch to RTL").click();
  await expect(page.locator("[dir='rtl']")).toBeVisible();

  const controlsBox = await page.getByTestId("demo-floating-controls").boundingBox();
  const crumbBox = await page.getByRole("navigation", { name: /breadcrumb/i }).boundingBox();
  expect(controlsBox).not.toBeNull();
  expect(crumbBox).not.toBeNull();
  expect(boxesOverlap(controlsBox!, crumbBox!)).toBe(false);
});

test("all floating demo controls remain visible and clickable", async ({ page }) => {
  await page.goto("demos/login");
  await page.waitForLoadState("networkidle");

  // Scoped to the floating-controls container: GlobalNav ships its own
  // theme toggle with the same accessible name, so an unscoped locator
  // would hit Playwright's strict-mode collision.
  const controls = page.getByTestId("demo-floating-controls");
  const themeToggle = controls.getByLabel(/switch to (dark|light) mode/i);
  const rtlToggle = controls.getByLabel(/switch to (rtl|ltr)/i);
  const cookiePrefs = controls.getByLabel("Cookie preferences");
  const vibeSelect = controls.getByLabel("Select vibe");

  await expect(themeToggle).toBeVisible();
  await expect(rtlToggle).toBeVisible();
  await expect(cookiePrefs).toBeVisible();
  await expect(vibeSelect).toBeVisible();

  await themeToggle.click();
  await expect(themeToggle).toBeVisible();
});
