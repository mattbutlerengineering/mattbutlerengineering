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
