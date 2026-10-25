import { test, expect } from "./fixtures.js";
import { pickBookingDate } from "./booking-date.js";
import { localDay } from "./local-day.js";

const VENUE_NAME = "E2E Test Bistro";

const VENUE_SLUG = "e2e-test-bistro";

test.describe("Booking widget — closures and pauses (venue-availability F9)", () => {
  test("a closed date shows its message, then is disabled and named in the calendar", async ({
    mockedPage,
  }) => {
    await mockedPage.route("**/public/v1/venues/*/availability*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], closure: { message: "Closed for a private event" } }),
      })
    );
    const closedDate = localDay(3);

    await mockedPage.goto(`book/${VENUE_SLUG}`);
    await expect(mockedPage.getByRole("heading", { name: VENUE_NAME })).toBeVisible();
    await pickBookingDate(mockedPage, closedDate);
    await mockedPage.getByRole("button", { name: "Find Available Times" }).click();
    await expect(mockedPage.getByText("Closed for a private event")).toBeVisible();

    await mockedPage.getByRole("button", { name: "See other dates" }).click();
    const cell = mockedPage.locator(`[role="gridcell"][data-date="${closedDate}"]`);
    await expect(cell).toHaveAttribute("aria-disabled", "true");
    await expect(cell).toHaveAttribute("aria-label", /closed.*Closed for a private event/i);
  });

  test("a closed date is disabled and named on the first visit", async ({ mockedPage }) => {
    const closedDate = localDay(3);
    await mockedPage.route("**/public/v1/venues/*/availability/dates*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ date: closedDate, closure: { message: "Closed for a private event" } }],
        }),
      })
    );

    await mockedPage.goto(`book/${VENUE_SLUG}`);
    await expect(mockedPage.getByRole("heading", { name: VENUE_NAME })).toBeVisible();

    const cell = mockedPage.locator(`[role="gridcell"][data-date="${closedDate}"]`);
    await expect(cell).toHaveAttribute("aria-disabled", "true");
    await expect(cell).toHaveAttribute("aria-label", /closed.*Closed for a private event/i);
    await cell.focus();
    await expect(mockedPage.getByRole("status")).toContainText("Closed for a private event");
  });

  test("a paused venue says so, with the phone while phone booking is open", async ({
    mockedPage,
  }) => {
    await mockedPage.route("**/public/v1/venues/*/availability*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          bookingPaused: { message: "Back at nine.", phone: "(555) 123-4567" },
        }),
      })
    );

    await mockedPage.goto(`book/${VENUE_SLUG}`);
    await expect(mockedPage.getByRole("heading", { name: VENUE_NAME })).toBeVisible();
    await mockedPage.getByRole("button", { name: "Find Available Times" }).click();

    await expect(mockedPage.getByText("Online booking is paused right now")).toBeVisible();
    await expect(mockedPage.getByText(/Call \(555\) 123-4567/)).toBeVisible();
  });
});
