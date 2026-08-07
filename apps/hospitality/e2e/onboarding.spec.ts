import { test, expect } from "./fixtures.js";
import { test as base } from "@playwright/test";
import { mockApi } from "./api-mocks.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

base.describe("Zero-venue account redirect (#3889)", () => {
  base("dashboard chrome never appears before landing on /onboarding", async ({ page }) => {
    await mockApi(page);

    // api-mocks.ts pre-seeds localStorage["mbe-hospitality-venue-id"] to
    // keep the rest of the E2E suite deterministic (see its comment on
    // that seed) — which means the suite is structurally incapable of
    // exercising a true zero-venue account. Undo the seed and make the
    // venues endpoint genuinely empty so this test hits the real race.
    await page.addInitScript(() => {
      localStorage.removeItem("mbe-hospitality-venue-id");
    });
    await page.route("**/api/v1/venues?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          pagination: {
            page: 1,
            limit: 25,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        }),
      })
    );

    await page.goto("");

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByTestId("dashboard-layout")).toHaveCount(0);
    await expect(page.getByText("Timeline")).not.toBeVisible();
  });
});

test.describe("Venue onboarding wizard", () => {
  test("page loads with the onboarding shell and step 1 (Basic Info)", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    // The dedicated OnboardingLayout renders the brand panel heading instead of
    // the old dashboard "New Venue" PageHeader (removed in #3337).
    await expect(mockedPage.getByRole("heading", { name: "Hospitality" })).toBeVisible();
    await expect(mockedPage.getByLabel("Venue Name")).toBeVisible();
    await expect(mockedPage.getByLabel("Slug")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/onboarding-step1.png", fullPage: true });
  });

  test("step 1 requires venue name before advancing", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await mockedPage.getByRole("button", { name: "Next" }).click();

    await expect(mockedPage.getByLabel("Venue Name")).toBeVisible();
  });

  test("completes step 1 and advances to step 2", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await mockedPage.getByLabel("Venue Name").fill("E2E Test Venue");

    await mockedPage.getByRole("button", { name: "Next" }).click();

    await expect(mockedPage.getByLabel("Timezone")).toBeVisible();
  });

  test("step 2 shows timezone and currency selectors", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await mockedPage.getByLabel("Venue Name").fill("E2E Test Venue");
    await mockedPage.getByRole("button", { name: "Next" }).click();

    await expect(mockedPage.getByLabel("Timezone")).toBeVisible();
    await expect(mockedPage.getByLabel("Currency")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/onboarding-step2.png", fullPage: true });
  });

  test("Back button returns to previous step", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await mockedPage.getByLabel("Venue Name").fill("E2E Test Venue");
    await mockedPage.getByRole("button", { name: "Next" }).click();
    await expect(mockedPage.getByLabel("Timezone")).toBeVisible();

    await mockedPage.getByRole("button", { name: "Back" }).click();

    await expect(mockedPage.getByLabel("Venue Name")).toBeVisible();
  });

  test("Back button is disabled on step 1", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await expect(mockedPage.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  test("advances through all 5 steps to confirmation", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await mockedPage.getByLabel("Venue Name").fill("E2E Test Venue");
    await mockedPage.getByRole("button", { name: "Next" }).click();

    // Step 2 (Location & Time) requires a timezone. It defaults from the browser's
    // detected IANA timezone, which is empty when the runner's TZ isn't in the
    // supported list (e.g. CI runners default to UTC) — select one explicitly.
    await expect(mockedPage.getByLabel("Timezone")).toBeVisible();
    await mockedPage.getByLabel("Timezone").fill("America/New_York");
    await mockedPage.getByRole("option", { name: "Eastern Time (America/New_York)" }).click();
    await mockedPage.getByRole("button", { name: "Next" }).click();

    // Step 3 (Operating Hours) requires at least one day to be open.
    // Rialto's Checkbox renders the native input with an sr-only clip-rect
    // (1px, clipped) with the visible decorative box positioned on top of
    // its hit-rect — Playwright's actionability check on the input's own
    // geometry gets intercepted by that box. Force the click (real users
    // toggle via the visible label/box, which is unaffected) and assert the
    // toggle actually landed instead of just that the call didn't throw.
    // Scoped by role (not getByLabel) because once monday is enabled, its
    // time inputs render with aria-labels containing "monday" too, which
    // would make a plain getByLabel("monday") match 3 elements.
    const mondayCheckbox = mockedPage.getByRole("checkbox", { name: "monday", exact: true });
    await mondayCheckbox.check({ force: true });
    await expect(mondayCheckbox).toBeChecked();
    await expect(mockedPage.getByLabel("monday opening time")).toBeVisible();

    await mockedPage.getByRole("button", { name: "Next" }).click();

    // Step 4 (Settings) — all fields optional, defaults apply.
    await mockedPage.getByRole("button", { name: "Next" }).click();

    await expect(mockedPage.getByRole("button", { name: /launch venue/i })).toBeVisible();
    await expect(mockedPage.getByText("Basic Information")).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/onboarding-complete.png",
      fullPage: true,
    });
  });
});
