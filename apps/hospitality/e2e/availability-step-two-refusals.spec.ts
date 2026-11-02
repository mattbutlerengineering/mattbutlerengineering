import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
import { localDay } from "./local-day.js";

/**
 * #7978. Add special date is a Step 2 flow of its own: when a group's bookings change while the
 * Manager is deciding, the server refuses the save. The sheet must say so, void the old choice,
 * show the group as it is now, and send the new reservation ids on the next save.
 */

const DINNER = { opensAt: 1020, lastSeatingAt: 1260, closesAt: 1380 };

/** The 1st of this month at noon: the date picker opens on this month, and the 15th is ahead. */
function firstOfMonthNoon(): Date {
  return new Date(`${localDay().slice(0, 8)}01T12:00:00`);
}

async function mockSheet(page: Page, date: string) {
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
  const batches: Array<{ items: Array<{ decisions: Array<{ reservationIds: string[] }> }> }> = [];
  let impacts = 0;

  await page.route(`${base}/availability/config`, (route) =>
    route.fulfill(
      json({
        config: {
          schedules: [{ id: "regular", name: "Regular week", kind: "regular", isRegular: true }],
          venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
          scheduleServices: [
            {
              id: "ss-dinner",
              scheduleId: "regular",
              venueServiceId: "vs-dinner",
              ...DINNER,
              seating: { version: 1, interval: 15 },
              bookingTypes: ["online", "phone"],
            },
          ],
          assignments: [
            { id: "as", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
          ],
          dateRules: [],
        },
        version: 7,
        source: "rows",
      })
    )
  );
  await page.route(`${base}/availability/days*`, (route) => route.fulfill(json([])));
  await page.route(`${base}/closures`, (route) => route.fulfill(json([])));
  await page.route(`${base}/closures/impact`, (route) => {
    impacts += 1;
    const ids = impacts === 1 ? ["res-1", "res-2"] : ["res-1", "res-2", "res-3"];
    return route.fulfill(
      json({
        reservations: ids.length,
        covers: ids.length * 2,
        depositsHeld: 0,
        groups: [
          {
            groupKey: `${date}:closed`,
            date,
            kind: "closed",
            covers: ids.length * 2,
            depositsHeld: 0,
            reservations: ids.map((id, i) => ({
              id,
              startTime: `${date}T23:${String(10 + i * 5).padStart(2, "0")}:00Z`,
              endTime: `${date}T23:50:00Z`,
              partySize: 2,
              guestName: `Guest ${i + 1}`,
              deposit: null,
              runsIntoClosure: false,
            })),
          },
        ],
      })
    );
  });
  await page.route(`${base}/closures/batch`, (route) => {
    batches.push(route.request().postDataJSON());
    if (batches.length === 1) {
      return route.fulfill({
        status: 422,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "about:blank",
          title: "decision-required",
          status: 422,
          detail: "Every affected group needs a choice.",
          code: "decision-required",
          groupKeys: [`${date}:closed`],
        }),
      });
    }
    return route.fulfill(
      json({
        version: 8,
        results: [
          {
            ruleId: "rule-1",
            version: 8,
            changeId: "chg-1",
            outcomes: { cancel: 3, move: 0, keep_notify: 0, keep_silent: 0 },
          },
        ],
      })
    );
  });
  return { batches: () => batches };
}

const sizes = [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
] as const;

for (const { width, height } of sizes) {
  test(`Add special date asks again on the group as it is now after a refusal (${width}x${height})`, async ({
    mockedPage,
  }) => {
    const now = firstOfMonthNoon();
    const date = `${localDay().slice(0, 8)}15`;
    await mockedPage.setViewportSize({ width, height });
    await mockedPage.clock.setFixedTime(now);
    const mocks = await mockSheet(mockedPage, date);
    await mockedPage.goto("availability");

    await mockedPage.getByRole("radio", { name: "Special dates" }).click();
    await mockedPage.getByRole("button", { name: "Add special date" }).click();
    const sheet = mockedPage.getByRole("dialog", { name: "Add special dates" });
    await sheet.getByRole("combobox", { name: "Date" }).click();
    await mockedPage.locator(`[data-date="${date}"]`).click();
    await sheet.getByTestId("add-dates-primary").click();

    await expect(sheet.getByText(/closed · 2 bookings/)).toBeVisible();
    const cancel = sheet
      .locator("label")
      .filter({ has: mockedPage.getByRole("radio", { name: /Cancel, notify & refund/ }) });
    await cancel.click();
    await sheet.getByTestId("add-dates-primary").click();

    await expect(sheet.getByText(/bookings changed while you were deciding/i)).toBeVisible();
    await expect(sheet.getByText(/closed · 3 bookings/)).toBeVisible();
    await expect(sheet.getByTestId("add-dates-primary")).toHaveText("Choose for each group");
    await expect(sheet.getByTestId("add-dates-primary")).toBeDisabled();

    await cancel.click();
    await sheet.getByTestId("add-dates-primary").click();

    const notifications = mockedPage.getByRole("region", { name: "Notifications" });
    await expect(notifications.getByText(/notified/)).toBeVisible();
    expect(mocks.batches()).toHaveLength(2);
    expect(mocks.batches()[1]?.items[0]?.decisions[0]?.reservationIds).toEqual([
      "res-1",
      "res-2",
      "res-3",
    ]);
  });
}
