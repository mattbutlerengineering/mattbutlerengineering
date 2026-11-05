import { test, expect } from "./fixtures.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";

/**
 * F1 (docs/features/venue-availability/ux.md): a Manager at a venue with no hours sets the
 * bistro week from the quick-setup card, bookings open, and the Setup checklist marks hours as
 * done. The config and venue endpoints are stateful: they answer "empty" until the PUT lands.
 */

test.describe("Availability quick setup (F1)", () => {
  test("a Manager sets the bistro week from an empty venue and the checklist marks hours done", async ({
    mockedPage,
  }) => {
    const state = await mockEmptyVenue(mockedPage);

    // The old entry point still lands on the new page.
    await mockedPage.goto("setup/hours");
    await expect(mockedPage).toHaveURL(/\/availability$/);
    await expect(mockedPage.getByRole("heading", { name: "Set your regular week" })).toBeVisible();

    await mockedPage.getByRole("button", { name: "Dinner" }).click();
    await mockedPage.getByRole("button", { name: "Weekdays" }).click();
    await expect(mockedPage.getByText(/Last seating 9:15 PM, 45 min before close/)).toBeVisible();
    await mockedPage.getByRole("button", { name: "Save and open bookings" }).click();

    await expect(mockedPage.getByText(/Bookings are open Mon, Tue/)).toBeVisible();
    await expect(mockedPage.getByRole("grid")).toBeVisible();
    expect(state.savedBody()).toMatchObject({ expectedVersion: 3 });

    await mockedPage.goto("setup");
    await expect(
      mockedPage.getByRole("listitem", { name: /Set Operating Hours — Completed/ })
    ).toBeVisible();
  });

  test("a service shorter than the lead seats at its opening, and saves (#7979)", async ({
    mockedPage,
  }) => {
    const state = await mockEmptyVenue(mockedPage);
    await mockedPage.goto("availability");

    const choose = async (label: string, time: string) => {
      await mockedPage.getByRole("combobox", { name: label }).click();
      await mockedPage
        .getByRole("listbox", { name: label })
        .getByRole("option", { name: time, exact: true })
        .click();
    };
    await mockedPage.getByRole("textbox", { name: /name/i }).first().fill("Early");
    await choose("Opens", "5:00 PM");
    await choose("Closes", "5:30 PM");
    await expect(mockedPage.getByRole("combobox", { name: "Last seating" })).toHaveValue("5:00 PM");
    await mockedPage.getByRole("button", { name: "Weekdays" }).click();
    await mockedPage.getByRole("button", { name: "Save and open bookings" }).click();

    await expect(mockedPage.getByRole("grid")).toBeVisible();
    expect(state.savedBody()).toMatchObject({ expectedVersion: 3 });
  });

  test("invalid input sends nothing and names the problem", async ({ mockedPage }) => {
    const state = await mockEmptyVenue(mockedPage);
    await mockedPage.goto("availability");

    await mockedPage.getByRole("button", { name: "Save and open bookings" }).click();
    await expect(mockedPage.getByText("Give this service a name.")).toBeVisible();
    await expect(mockedPage.getByText("Choose at least one day.")).toBeVisible();
    expect(state.savedBody()).toBeNull();
  });
});
