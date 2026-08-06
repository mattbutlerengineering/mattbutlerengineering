import { test, expect } from "./fixtures.js";
import { test as freshAccountTest } from "@playwright/test";
import { mockApi } from "./api-mocks.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

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

// Deliberate delay on the mocked venues response so the app's "loading"
// phase has a real, pollable window in the test below — without it, the
// mocked response could resolve fast enough for a flash-of-chrome regression
// to slip past the assertion before it ever gets a chance to observe it.
const VENUES_FETCH_DELAY_MS = 250;

// Regression for #3889: a genuinely zero-venue account must never paint
// dashboard chrome (sidebar/breadcrumbs/nav/Outlet) before landing on
// /onboarding. This deliberately does NOT use the `mockedPage` fixture —
// api-mocks.ts:46-59 pre-seeds `localStorage["mbe-hospitality-venue-id"]`
// before every test boots specifically so the rest of the suite never
// exercises a truly empty venue list (see the comment there for why). This
// spec opts out of that seed and mocks a real empty venues response instead.
test.describe("Zero-venue account (issue #3889)", () => {
  freshAccountTest(
    "does not paint dashboard chrome before redirecting to /onboarding",
    async ({ page }) => {
      await mockApi(page, { seedVenueId: false });

      // Registered after mockApi (Playwright routes match LIFO — last
      // registered wins), overriding the venues list with a genuinely empty
      // one.
      await page.route("**/api/v1/venues?*", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, VENUES_FETCH_DELAY_MS));
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [] }),
        });
      });

      await page.goto("");

      // Chrome must not paint at all while the account resolves as
      // zero-venue — checked before the redirect settles.
      await expect(page.getByTestId("dashboard-layout")).toHaveCount(0);

      await page.waitForURL(/\/onboarding/, { timeout: 10_000 });

      await expect(page.getByTestId("dashboard-layout")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Hospitality" })).toBeVisible();
    }
  );
});
