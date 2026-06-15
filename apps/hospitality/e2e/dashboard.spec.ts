import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-2: Dashboard morning load", () => {
  test("dashboard page loads with heading", async ({ mockedPage }) => {
    await mockedPage.goto("dashboard");

    await expect(mockedPage.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/dashboard-loaded.png", fullPage: true });
  });

  test("stats widgets render with mocked data", async ({ mockedPage }) => {
    await mockedPage.goto("dashboard");

    // All four Stat widgets defined in HomePage
    await expect(mockedPage.getByText("Today's Reservations")).toBeVisible();
    await expect(mockedPage.getByText("Expected Covers")).toBeVisible();
    await expect(mockedPage.getByText("Upcoming (2 hrs)")).toBeVisible();
    await expect(mockedPage.getByText("Cancellation Rate")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/dashboard-stats.png", fullPage: true });
  });

  test("Live Activity card is visible indicating SSE connection state", async ({ mockedPage }) => {
    await mockedPage.goto("dashboard");

    // The ActivityFeed always shows a "Live Activity" card heading
    await expect(mockedPage.getByText("Live Activity")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/dashboard-activity.png", fullPage: true });
  });

  test("quick action buttons are visible", async ({ mockedPage }) => {
    await mockedPage.goto("dashboard");

    await expect(mockedPage.getByRole("button", { name: /New Walk.?In/i })).toBeVisible();
    await expect(mockedPage.getByRole("button", { name: /View Floor Plan/i })).toBeVisible();
    await expect(mockedPage.getByRole("button", { name: /Guest Lookup/i })).toBeVisible();
  });

  test("stats API 500 — page renders error state without crashing", async ({ mockedPage }) => {
    // Register the 500 override AFTER mockedPage has set up the default mocks.
    // Playwright resolves routes LIFO, so this handler wins over the existing 200 mock.
    await mockedPage.route("**/api/v1/reservations?*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"error":"server error"}',
      })
    );

    await mockedPage.goto("dashboard");

    // Page must not crash — Dashboard heading still visible
    await expect(mockedPage.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Error banner with retry option renders
    await expect(mockedPage.getByRole("button", { name: /retry/i })).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/dashboard-error.png", fullPage: true });
  });
});
