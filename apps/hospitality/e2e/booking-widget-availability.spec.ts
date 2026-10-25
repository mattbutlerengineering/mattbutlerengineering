import { test, expect } from "./fixtures.js";
import { pickBookingDate } from "./booking-date.js";

const VENUE_SLUG = "e2e-test-bistro";

function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

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
    const closedDate = isoInDays(3);

    await mockedPage.goto(`book/${VENUE_SLUG}`);
    await pickBookingDate(mockedPage, closedDate);
    await mockedPage.getByRole("button", { name: "Find Available Times" }).click();
    await expect(mockedPage.getByText("Closed for a private event")).toBeVisible();

    await mockedPage.getByRole("button", { name: "See other dates" }).click();
    const cell = mockedPage.locator(`[role="gridcell"][data-date="${closedDate}"]`);
    await expect(cell).toHaveAttribute("aria-disabled", "true");
    await expect(cell).toHaveAttribute("aria-label", /closed.*Closed for a private event/i);
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
    await mockedPage.getByRole("button", { name: "Find Available Times" }).click();

    await expect(mockedPage.getByText("Online booking is paused right now")).toBeVisible();
    await expect(mockedPage.getByText(/Call \(555\) 123-4567/)).toBeVisible();
  });
});
