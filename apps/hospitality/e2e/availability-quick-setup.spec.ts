import { test, expect } from "./fixtures.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { weekPanel } from "./helpers/first-paint.js";

/**
 * F1 (docs/features/venue-availability/ux.md): a Manager at a venue with no hours sets the
 * bistro week from the quick-setup card, bookings open, and Venue Setup marks hours as
 * done. The config and venue endpoints are stateful: they answer "empty" until the PUT lands.
 */

test.describe("Availability quick setup (F1)", () => {
  test("a Manager sets the bistro week from an empty venue and Venue Setup marks hours done", async ({
    mockedPage,
  }) => {
    const state = await mockEmptyVenue(mockedPage);

    // The old entry point lands on the hub, which sends a Manager with no hours to first setup.
    await mockedPage.goto("setup/hours");
    await expect(mockedPage).toHaveURL(/\/availability\/hours$/);
    await expect(mockedPage.getByRole("heading", { name: "Set your regular week" })).toBeVisible();

    await mockedPage.getByRole("button", { name: "Dinner" }).click();
    await mockedPage.getByRole("button", { name: "Weekdays" }).click();
    await expect(mockedPage.getByText(/Last seating 9:15 PM, 45 min before close/)).toBeVisible();
    await mockedPage.getByRole("button", { name: "Save and open bookings" }).click();

    await expect(mockedPage.getByText("Bookings are open Mon–Fri")).toBeVisible();
    // The save lands on the hub with row 1 filled (availability-hub ux.md, "First setup").
    await expect(mockedPage).toHaveURL(/\/availability$/);
    await expect(mockedPage.getByTestId("hub-row-1")).toContainText("Dinner");
    expect(state.savedBody()).toMatchObject({ expectedVersion: 3 });

    // Venue Setup (the standing /setup page) now shows the saved week and counts the step done.
    await mockedPage.goto("setup");
    await expect(mockedPage.getByRole("listitem", { name: /Schedules/ })).toContainText(
      "1 schedule"
    );
    await expect(
      mockedPage.getByRole("region", { name: "Venue Setup progress" }).getByText("2 of 3")
    ).toBeVisible();
  });

  test("a service shorter than the lead seats at its opening, and saves (#7979)", async ({
    mockedPage,
  }) => {
    const state = await mockEmptyVenue(mockedPage);
    await mockedPage.goto("availability/calendar");

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

    // The save lands on the week panel (Schedules layer), not the calendar.
    await expect(weekPanel(mockedPage)).toBeVisible();
    expect(state.savedBody()).toMatchObject({ expectedVersion: 3 });
  });

  test("invalid input sends nothing and names the problem", async ({ mockedPage }) => {
    const state = await mockEmptyVenue(mockedPage);
    await mockedPage.goto("availability/calendar");

    await mockedPage.getByRole("button", { name: "Save and open bookings" }).click();
    await expect(mockedPage.getByText("Give this service a name.")).toBeVisible();
    await expect(mockedPage.getByText("Choose at least one day.")).toBeVisible();
    expect(state.savedBody()).toBeNull();
  });
});
