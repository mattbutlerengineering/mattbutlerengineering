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

    // Dashboard stat row was redesigned in #3212: the three count tiles roll
    // on rialto Odometers — the label renders as an adjacent paragraph and the
    // value announces through the Odometer's sole accessible surface, a
    // role="status" live region. The bounded cancellation-rate percentage
    // reads on a Meter with an accessible name.
    // "Today's Reservations" also titles the reservation-list card, so scope
    // the label assertion to the paragraph to keep strict mode happy.
    await expect(
      mockedPage.getByRole("paragraph").filter({ hasText: "Today's Reservations" })
    ).toBeVisible();
    await expect(mockedPage.getByText("Expected Covers")).toBeVisible();
    await expect(mockedPage.getByText("Upcoming (2 hrs)")).toBeVisible();
    // Announced values derive from the mocked reservations fixture:
    // 3 bookings, 4 + 2 + 6 = 12 covers, 2 upcoming within the window.
    await expect(mockedPage.getByRole("status").filter({ hasText: /^3$/ })).toBeVisible();
    await expect(mockedPage.getByRole("status").filter({ hasText: /^12$/ })).toBeVisible();
    await expect(mockedPage.getByRole("status").filter({ hasText: /^2$/ })).toBeVisible();
    await expect(mockedPage.getByRole("meter", { name: "Cancellation Rate" })).toBeVisible();
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
