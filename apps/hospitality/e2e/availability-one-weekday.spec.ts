import { test, expect } from "./fixtures.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { setDemoWeek } from "./helpers/quick-setup-scenarios.js";
import { calendarWeek, nextMonday } from "./helpers/week-dates.js";
import { localDay } from "./local-day.js";

/**
 * One weekday of a regular week (PRD: Change regular week, one day). The demo week is entered in
 * quick setup; Change regular week then gives Lunch different hours on Wednesday only. The other
 * six weekdays must resolve as before, no schedule or assignment may appear (the save writes only
 * regular versions), and History must name Wednesday.
 *
 * The calendar's days and the History entry come from `mockEmptyVenue`: the days from the same
 * pure engine the service runs, the entry shaped as the service writes a `regular_week_changed`
 * audit row. Local run, synthetic OIDC session (auth.setup.ts skipped; no Auth0 E2E creds locally).
 */
test.describe("Change one weekday of the regular week", () => {
  test("Lunch closes earlier on Wednesday only", async ({ mockedPage: page }) => {
    test.slow();
    await page.clock.setFixedTime(new Date(`${localDay()}T12:00:00`));
    const state = await mockEmptyVenue(page, { derive: true });
    await page.goto("availability");
    await setDemoWeek(page);
    await page.getByRole("button", { name: "Save and open bookings" }).click();
    await expect(page.getByRole("grid")).toBeVisible();

    const monday = nextMonday(localDay());
    await page.getByRole("radio", { name: "Week" }).click({ force: true });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const before = await calendarWeek(page, monday);
    expect(before.Wednesday).toContain("Lunch 11:30 AM – 1:45 PM");

    // Change regular week: a block of different hours for Lunch on Wednesday.
    await page.getByRole("button", { name: "Change regular week…" }).click();
    const drawer = page.getByRole("dialog").first();
    await drawer.getByRole("button", { name: "Different hours on some days" }).first().click();
    const block = drawer.getByRole("group", { name: "Lunch: different hours" });
    await block.getByText("Wed", { exact: true }).click();
    await block.getByRole("combobox", { name: "Closes" }).click();
    await page
      .getByRole("listbox", { name: "Closes" })
      .getByRole("option", { name: "1:00 PM", exact: true })
      .click();
    await drawer.getByLabel("Starting").click();
    await page.locator(`[role="gridcell"][data-date="${localDay()}"]`).click();
    await drawer.getByRole("button", { name: /^Save hours from/ }).click();
    await expect(drawer).toBeHidden();

    // Wednesday's lunch moved; the other six weekdays read as before.
    const after = await calendarWeek(page, monday);
    expect(after.Wednesday).not.toEqual(before.Wednesday);
    expect(after.Wednesday).toContain("Lunch 11:30 AM – 12:15 PM");
    for (const day of Object.keys(before).filter((d) => d !== "Wednesday")) {
      expect(after[day], day).toEqual(before[day]);
    }

    // No schedule of its own: the save writes the new regular version and end-dates the superseded
    // one, both kind "regular" and named "Regular week".
    const saved = state.savedBody()?.changes as {
      upsert: { schedules?: Array<{ kind: string; name: string }> };
    };
    expect(saved.upsert.schedules?.map((s) => [s.kind, s.name])).toEqual([
      ["regular", "Regular week"],
      ["regular", "Regular week"],
    ]);

    // History names the weekday.
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "History" }).click();
    await expect(
      page
        .getByRole("dialog")
        .first()
        .getByText(/Changed regular week from .*: Wed$/)
    ).toBeVisible();
  });
});
