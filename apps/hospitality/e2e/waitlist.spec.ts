import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("Hospitality waitlist [6/6]: add -> list -> seat", () => {
  test("adds a guest to the waitlist, shows position 1, then seats and removes them", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("waitlist");

    // Waitlist starts empty for this venue in the mocked session.
    await expect(mockedPage.getByText(/no one waiting/i)).toBeVisible();

    // Fill out and submit the "Add to waitlist" form.
    await mockedPage.getByLabel(/guest name/i).fill("Priya Shah");
    await mockedPage.getByLabel(/guest phone/i).fill("(555) 234-5678");
    await mockedPage.getByRole("button", { name: "2", exact: true }).click();
    await mockedPage.getByRole("button", { name: /add to waitlist/i }).click();

    // Guest appears in the list at position 1.
    const emptyState = mockedPage.getByText(/no one waiting/i);
    await expect(emptyState).not.toBeVisible();
    await expect(mockedPage.getByText("Priya Shah")).toBeVisible();
    await expect(mockedPage.getByText("#1")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/waitlist-added.png", fullPage: true });

    // Seat the guest — a table is auto-selected, so "Seat" is immediately
    // available without an explicit table pick.
    await mockedPage.getByRole("button", { name: /^seat$/i }).click();

    // Removed from the waiting list, and the seat action created a reservation.
    await expect(mockedPage.getByText("Priya Shah")).not.toBeVisible();
    await expect(mockedPage.getByText(/no one waiting/i)).toBeVisible();

    await mockedPage.goto("timeline");
    await expect(
      mockedPage.getByTestId(/^reservation-block-/).filter({ hasText: "Priya Shah" })
    ).toBeVisible();
  });
});
