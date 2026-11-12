import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { localDay } from "./local-day.js";
import { WEEKDAYS, nextMonday, plusDays, serviceLines } from "./helpers/week-dates.js";

/**
 * The PRD's demo, step by step, on an empty venue and through quick setup only (no visit to the
 * Schedules tab):
 *
 *   Open an empty venue's setup as the Manager. Enter lunch Mon–Fri, then dinner Tue–Sun. Set
 *   Friday's and Saturday's close later. Beside the form, the seven-day strip shows each
 *   weekday's bookable times as a guest would see them. Friday's and Saturday's last slots move
 *   later as the close is set, and Monday has no dinner. The Manager saves a week they already
 *   watched.
 *
 * The week is the demo week of ux.md W1: lunch Mon–Fri, dinner Tue–Sun closing 12:00 AM on
 * Fri–Sat, brunch Sat–Sun. Presets give Lunch 11:30 AM–2:30 PM, Dinner 5:00 PM–10:00 PM and
 * Brunch 10:00 AM–2:00 PM, each with its last seating 45 minutes before close.
 */

/** Each weekday's services as a guest could book them: first to last time. */
const GUEST_LINES: Record<string, string[]> = {
  Monday: ["Lunch 11:30 AM – 1:45 PM"],
  Tuesday: ["Lunch 11:30 AM – 1:45 PM", "Dinner 5:00 PM – 9:15 PM"],
  Wednesday: ["Lunch 11:30 AM – 1:45 PM", "Dinner 5:00 PM – 9:15 PM"],
  Thursday: ["Lunch 11:30 AM – 1:45 PM", "Dinner 5:00 PM – 9:15 PM"],
  Friday: ["Lunch 11:30 AM – 1:45 PM", "Dinner 5:00 PM – 11:15 PM"],
  Saturday: ["Brunch 10:00 AM – 1:15 PM", "Dinner 5:00 PM – 11:15 PM"],
  Sunday: ["Brunch 10:00 AM – 1:15 PM", "Dinner 5:00 PM – 9:15 PM"],
};

/**
 * The same services as the calendar cell and the day drawer print them (ux.md "Service time
 * rule"): open–close, then last seating; a past-midnight close reads "12:00 AM (next day)".
 */
const SERVICE_HOURS: Record<string, string[]> = {
  Monday: ["Lunch 11:30 AM–2:30 PM, last seating 1:45 PM"],
  Tuesday: [
    "Lunch 11:30 AM–2:30 PM, last seating 1:45 PM",
    "Dinner 5:00 PM–10:00 PM, last seating 9:15 PM",
  ],
  Wednesday: [
    "Lunch 11:30 AM–2:30 PM, last seating 1:45 PM",
    "Dinner 5:00 PM–10:00 PM, last seating 9:15 PM",
  ],
  Thursday: [
    "Lunch 11:30 AM–2:30 PM, last seating 1:45 PM",
    "Dinner 5:00 PM–10:00 PM, last seating 9:15 PM",
  ],
  Friday: [
    "Lunch 11:30 AM–2:30 PM, last seating 1:45 PM",
    "Dinner 5:00 PM–12:00 AM (next day), last seating 11:15 PM",
  ],
  Saturday: [
    "Brunch 10:00 AM–2:00 PM, last seating 1:15 PM",
    "Dinner 5:00 PM–12:00 AM (next day), last seating 11:15 PM",
  ],
  Sunday: [
    "Brunch 10:00 AM–2:00 PM, last seating 1:15 PM",
    "Dinner 5:00 PM–10:00 PM, last seating 9:15 PM",
  ],
};

const strip = (page: Page) => page.getByRole("complementary", { name: "Guest preview" });
const stripRow = (page: Page, day: string) =>
  strip(page).getByRole("listitem", { name: new RegExp(`^${day}:`) });

async function stripWeek(page: Page): Promise<Record<string, string[]>> {
  const week: Record<string, string[]> = {};
  for (const day of WEEKDAYS) week[day] = await serviceLines(stripRow(page, day));
  return week;
}

async function chooseTime(scope: Locator, page: Page, label: string, time: string) {
  await scope.getByRole("combobox", { name: label }).click();
  await page
    .getByRole("listbox", { name: label })
    .getByRole("option", { name: time, exact: true })
    .click();
}

test.describe("The demo week (PRD: the demo runs as written)", () => {
  test("a Manager enters a varied week in quick setup, watches the strip, and the saved week reads the same everywhere", async ({
    mockedPage: page,
  }) => {
    // Seven weekdays are each opened in the drawer and previewed; that is slower than one screen.
    test.slow();
    await page.clock.setFixedTime(new Date(`${localDay()}T12:00:00`));
    const state = await mockEmptyVenue(page, { derive: true });
    const requests: string[] = [];
    page.on("request", (request) => requests.push(`${request.method()} ${request.url()}`));

    // 1. Open an empty venue's setup as the Manager.
    await page.goto("availability");
    await expect(page.getByRole("heading", { name: "Set your regular week" })).toBeVisible();
    await expect(
      strip(page).getByText(
        "Add a service with its times and days to see what guests can book each day."
      )
    ).toBeVisible();
    const afterOpening = requests.length;

    // 2-4. Lunch from its chip, shared days every day, then Lunch's own days: Mon–Fri.
    await page.getByRole("button", { name: "Lunch" }).click();
    await page.getByRole("button", { name: "Every day" }).click();
    await expect(stripRow(page, "Saturday")).toContainText("Lunch 11:30 AM – 1:45 PM");
    await page.getByRole("button", { name: "Different days for this service" }).click();
    await page
      .getByRole("group", { name: "Lunch runs on" })
      .getByRole("button", { name: "Weekdays" })
      .click();
    await expect(stripRow(page, "Saturday")).toContainText("Closed");
    await expect(stripRow(page, "Monday")).toContainText("Lunch 11:30 AM – 1:45 PM");

    // 5-6. Dinner follows the shared days; untick Monday in its own days.
    await page.getByRole("button", { name: "Add another service" }).click();
    await page.getByRole("button", { name: "Dinner" }).last().click();
    await expect(stripRow(page, "Monday")).toContainText("Dinner 5:00 PM – 9:15 PM");
    await page.getByRole("button", { name: "Different days for this service" }).last().click();
    await page
      .getByRole("group", { name: "Dinner runs on" })
      .getByRole("checkbox", { name: "Monday" })
      .uncheck({ force: true });
    // Monday has no dinner for the demo week.
    await expect(stripRow(page, "Monday")).toContainText("Lunch 11:30 AM – 1:45 PM");
    await expect(stripRow(page, "Monday")).not.toContainText(/Dinner \d/);
    await expect(stripRow(page, "Monday")).toContainText("Not offered: Dinner");
    await expect(stripRow(page, "Friday")).toContainText("Dinner 5:00 PM – 9:15 PM");
    await expect(stripRow(page, "Saturday")).toContainText("Dinner 5:00 PM – 9:15 PM");

    // 7. A later close for Friday and Saturday: a block of different hours for Dinner.
    await page.getByRole("button", { name: "Different hours on some days" }).last().click();
    const later = page.getByRole("group", { name: "Dinner: different hours" });
    await later.getByRole("checkbox", { name: "Fri" }).check({ force: true });
    await later.getByRole("checkbox", { name: "Sat" }).check({ force: true });
    // The strip has not moved yet: the block still has Dinner's own hours.
    await expect(stripRow(page, "Friday")).toContainText("Dinner 5:00 PM – 9:15 PM");
    await chooseTime(later, page, "Closes", "12:00 AM");
    await expect(later.getByText("Closes 12:00 AM the next day")).toBeVisible();

    // Friday's and Saturday's last slots moved later, before any save, without leaving the form.
    await expect(stripRow(page, "Friday")).toContainText("Dinner 5:00 PM – 11:15 PM");
    await expect(stripRow(page, "Saturday")).toContainText("Dinner 5:00 PM – 11:15 PM");
    await expect(stripRow(page, "Thursday")).toContainText("Dinner 5:00 PM – 9:15 PM");
    await expect(stripRow(page, "Friday").getByText("Updated")).toBeVisible();
    await expect(stripRow(page, "Saturday").getByText("Updated")).toBeVisible();
    await expect(stripRow(page, "Thursday").getByText("Updated")).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Friday, Saturday updated" })
    ).toBeAttached();
    await expect(page).toHaveURL(/\/availability\/calendar$/);

    // 8. Brunch from its chip, on weekends.
    await page.getByRole("button", { name: "Add another service" }).click();
    await page.getByRole("button", { name: "Brunch" }).last().click();
    await page.getByRole("button", { name: "Different days for this service" }).last().click();
    await page
      .getByRole("group", { name: "Brunch runs on" })
      .getByRole("button", { name: "Weekends" })
      .click();

    // The week the Manager watched, read off the strip before saving.
    const watched = await stripWeek(page);
    expect(watched).toEqual(GUEST_LINES);
    // Entering the week asked the server for nothing: no preview, no day list, no config read.
    const asked = requests.slice(afterOpening).filter((r) => /\/availability\//.test(r));
    expect(asked).toEqual([]);
    expect(state.savedBody()).toBeNull();

    // 9. Save the week they already watched.
    await page.getByRole("button", { name: "Save and open bookings" }).click();
    await expect(page.getByText("Bookings are open every day")).toBeVisible();
    expect(state.savedBody()).toMatchObject({ expectedVersion: 3 });
    // The save lands on the week panel (Schedules layer); the calendar is the next layer over.
    await page.goto("availability?tab=calendar");
    await expect(page.getByRole("grid")).toBeVisible();

    // The calendar: each weekday of next week lists the same services, in the service time rule.
    const monday = nextMonday(localDay());
    await page.getByRole("radio", { name: "Week" }).click({ force: true });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    for (const [offset, day] of WEEKDAYS.entries()) {
      const cell = page.locator(`[data-date="${plusDays(monday, offset)}"]`);
      await expect(cell).toBeVisible();
      // The day list loads after the week renders, so wait for it rather than read a skeleton.
      await expect
        .poll(async () => serviceLines(cell), { message: `calendar, ${day}` })
        .toEqual(SERVICE_HOURS[day]);
    }

    // The day drawer prints each weekday's services as the calendar cell does; the guest preview,
    // opened by starting an edit of the day's first service, lists what a guest can book and is
    // the strip's own line for the day. Editing a close moves no bookable time, so every line stays comparable.
    for (const [offset, day] of WEEKDAYS.entries()) {
      await page.locator(`[data-date="${plusDays(monday, offset)}"]`).click();
      const drawer = page.getByRole("dialog").first();
      const first = GUEST_LINES[day]![0]!.split(" ")[0]!;
      await expect(drawer.getByRole("button", { name: `Edit ${first}` })).toBeVisible();
      expect(await serviceLines(drawer), `drawer, ${day}`).toEqual(SERVICE_HOURS[day]);

      await drawer.getByRole("button", { name: `Edit ${first}` }).click();
      await chooseTime(drawer.getByRole("group", { name: first }), page, "Closes", "3:00 PM");
      await expect(drawer.getByRole("heading", { name: "Guest preview" })).toBeVisible();
      await expect
        .poll(async () => serviceLines(drawer), { message: `guest preview, ${day}` })
        .toEqual(watched[day]);

      // Leave without saving: the draft was only there to open the preview. Discarding closes it.
      await drawer.getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Discard" }).click();
      // The pinned clock stalls the drawer's exit by about 4-6 s (4.4 s before availability-scenario-ux).
      await expect(drawer).toBeHidden({ timeout: 15_000 });
    }
  });
});
