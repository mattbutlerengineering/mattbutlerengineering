import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
    await mockedPage.getByRole("button", { name: "Add special dates" }).click();
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

/**
 * #8028. A series edit from the first date names the series it was built from (`alongside.replaces`).
 * When the server finds the stored series changed since, it answers with the version conflict, and
 * the Manager lands back on the form with the same "Availability changed" recovery, not a dead end.
 */
test("a series edit the server refuses as built from a changed series returns to the form (#8028)", async ({
  mockedPage,
}) => {
  const month = localDay().slice(0, 8);
  const date = `${month}15`;
  const series = {
    id: "series-1",
    kind: "closure",
    targetKind: "venue",
    startsOn: `${month}08`,
    endsOn: null,
    repeat: { version: 1, weekdays: [1] },
    guestMessage: "Closed on Mondays",
  };
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
  const saves: Array<{ alongside?: { replaces?: unknown } }> = [];

  await mockedPage.clock.setFixedTime(firstOfMonthNoon());
  await mockedPage.route(`${base}/availability/config`, (route) =>
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
          dateRules: [series],
        },
        version: 7,
        source: "rows",
      })
    )
  );
  await mockedPage.route(`${base}/availability/days*`, (route) => route.fulfill(json([])));
  await mockedPage.route(`${base}/closures/impact`, (route) =>
    route.fulfill(
      json({
        reservations: 2,
        covers: 4,
        depositsHeld: 0,
        groups: [
          {
            groupKey: `${date}:closed`,
            date,
            kind: "closed",
            covers: 4,
            depositsHeld: 0,
            reservations: ["res-1", "res-2"].map((id, i) => ({
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
    )
  );
  await mockedPage.route(`${base}/closures`, (route) => {
    if (route.request().method() !== "POST") return route.fulfill(json([]));
    saves.push((route.request().postDataJSON() as { alongside: { replaces?: unknown } }) ?? {});
    return route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "Availability changed since you loaded it.",
        code: "version-conflict",
        winningChange: null,
      }),
    });
  });

  await mockedPage.goto("availability");
  await mockedPage.getByRole("radio", { name: "Special dates" }).click();
  await mockedPage.getByRole("button", { name: "Edit dates…" }).click();
  const dialog = mockedPage.getByRole("dialog", { name: "Edit dates" });
  const labelOf = (role: "radio" | "checkbox", name: string | RegExp) =>
    dialog.locator("label").filter({ has: mockedPage.getByRole(role, { name }) });
  await labelOf("radio", "All dates").click();
  await labelOf("checkbox", "Tue").click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await labelOf("radio", /Cancel, notify & refund/).click();
  await dialog.getByRole("button", { name: /Close and cancel/ }).click();

  await expect(dialog.getByText(/Availability changed since you opened this/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeVisible();
  expect(saves).toHaveLength(1);
  expect(saves[0]?.alongside?.replaces).toMatchObject({ id: "series-1" });
});

/**
 * #7984. Skipping one date of a repeating closure is a config save that tells no guest, so it
 * offers Undo, and Undo reverts that change against the version the skip produced.
 */
const SKIP_LOCALES = [
  {
    tag: "en-US",
    special: "Special dates",
    edit: "Edit dates…",
    dialog: "Edit dates",
    skip: "Skip this date",
    undo: "Undo",
  },
  {
    tag: "fr-CA",
    special: "Dates spéciales",
    edit: "Modifier les dates…",
    dialog: "Modifier les dates",
    skip: "Ignorer cette date",
    undo: "Annuler",
  },
] as const;

for (const locale of SKIP_LOCALES) {
  for (const { width, height } of sizes) {
    test(`skipping a date of a repeating closure offers Undo in ${locale.tag} (${width}x${height}, #7984)`, async ({
      mockedPage,
    }) => {
      const month = localDay().slice(0, 8);
      const series = {
        id: "series-1",
        kind: "closure",
        targetKind: "venue",
        startsOn: `${month}08`,
        endsOn: null,
        repeat: { version: 1, weekdays: [1] },
        guestMessage: "Closed on Mondays",
      };
      const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
      const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
      const json = (data: unknown) => ({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });
      const saves: Array<{ expectedVersion: number }> = [];
      const reverts: Array<{ expectedVersion: number }> = [];

      await mockedPage.addInitScript(
        (tag) => localStorage.setItem("mbe-hospitality-locale", tag),
        locale.tag
      );
      await mockedPage.setViewportSize({ width, height });
      await mockedPage.clock.setFixedTime(firstOfMonthNoon());
      const config = {
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
        dateRules: [series],
      };
      await mockedPage.route(`${base}/availability/config`, (route) => {
        if (route.request().method() === "PUT") {
          saves.push(route.request().postDataJSON() as { expectedVersion: number });
          return route.fulfill(json({ version: 8, changeId: "chg-8" }));
        }
        return route.fulfill(json({ config, version: 7, source: "rows" }));
      });
      await mockedPage.route(`${base}/availability/days*`, (route) => route.fulfill(json([])));
      await mockedPage.route(`${base}/closures`, (route) => route.fulfill(json([])));
      await mockedPage.route(`${base}/availability/changes/**`, (route) => {
        reverts.push(route.request().postDataJSON() as { expectedVersion: number });
        return route.fulfill(json({ version: 9, changeId: "chg-9" }));
      });

      await mockedPage.goto("availability");
      await mockedPage.getByRole("radio", { name: locale.special }).click();
      await mockedPage.getByRole("button", { name: locale.edit }).click();
      const dialog = mockedPage.getByRole("dialog", { name: locale.dialog });
      await dialog.getByRole("button", { name: locale.skip }).click();

      const undo = mockedPage.getByRole("button", { name: locale.undo });
      await expect(undo).toBeVisible();
      const results = await new AxeBuilder({ page: mockedPage }).include("main").analyze();
      expect(results.violations).toEqual([]);
      await undo.click();

      await expect.poll(() => reverts.length).toBe(1);
      expect(saves).toHaveLength(1);
      expect(reverts[0]?.expectedVersion).toBe(8);
    });
  }
}

/**
 * #7984. Reopening one date of a range sends that date with the range as the screen read it, and,
 * since it tells no guest, offers Undo against the version it produced.
 */
const REOPEN_LOCALES = [
  {
    tag: "en-US",
    special: "Special dates",
    remove: /^Remove closure for/,
    pick: "What to reopen",
    undo: "Undo",
  },
  {
    tag: "fr-CA",
    special: "Dates spéciales",
    remove: /^Retirer la fermeture pour/,
    pick: "À rouvrir",
    undo: "Annuler",
  },
] as const;

for (const locale of REOPEN_LOCALES) {
  for (const { width, height } of sizes) {
    test(`reopening one date of a range sends the date and offers Undo in ${locale.tag} (${width}x${height}, #7984)`, async ({
      mockedPage,
    }) => {
      const month = localDay().slice(0, 8);
      const range = {
        id: "holidays",
        kind: "closure",
        targetKind: "venue",
        startsOn: `${month}15`,
        endsOn: `${month}18`,
        guestMessage: "Closed for the holidays",
      };
      const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
      const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
      const json = (data: unknown) => ({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });
      const reopens: Array<{ date?: string; tellCancelledGuests: boolean }> = [];
      const reverts: Array<{ expectedVersion: number }> = [];

      await mockedPage.addInitScript(
        (tag) => localStorage.setItem("mbe-hospitality-locale", tag),
        locale.tag
      );
      await mockedPage.setViewportSize({ width, height });
      await mockedPage.clock.setFixedTime(firstOfMonthNoon());
      await mockedPage.route(`${base}/availability/config`, (route) =>
        route.fulfill(
          json({
            config: {
              schedules: [
                { id: "regular", name: "Regular week", kind: "regular", isRegular: true },
              ],
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
              dateRules: [range],
            },
            version: 7,
            source: "rows",
          })
        )
      );
      await mockedPage.route(`${base}/availability/days*`, (route) => route.fulfill(json([])));
      await mockedPage.route(`${base}/closures`, (route) => route.fulfill(json([])));
      await mockedPage.route(`${base}/closures/holidays`, (route) => {
        reopens.push(route.request().postDataJSON() as { tellCancelledGuests: boolean });
        return route.fulfill(json({ version: 8, changeId: "chg-8", notified: 0 }));
      });
      await mockedPage.route(`${base}/availability/changes/**`, (route) => {
        reverts.push(route.request().postDataJSON() as { expectedVersion: number });
        return route.fulfill(json({ version: 9, changeId: "chg-9" }));
      });

      await mockedPage.goto("availability");
      await mockedPage.getByRole("radio", { name: locale.special }).click();
      await mockedPage.getByRole("button", { name: locale.remove }).click();
      const dialog = mockedPage.getByRole("dialog");
      await dialog.getByRole("combobox", { name: locale.pick }).click();
      // Option 0 is "all dates"; 2 is the second date of the range.
      await mockedPage.getByRole("option").nth(2).click();
      await expect(mockedPage.getByRole("listbox")).toHaveCount(0);
      // The dialog is portaled out of <main>; the page behind its scrim is not what is on trial.
      const results = await new AxeBuilder({ page: mockedPage })
        .include('[role="dialog"]')
        .analyze();
      expect(results.violations).toEqual([]);
      await dialog.getByRole("button").last().click();

      await expect.poll(() => reopens.length).toBe(1);
      expect(reopens[0]?.date).toBe(`${month}16`);
      const undo = mockedPage.getByRole("button", { name: locale.undo });
      await expect(undo).toBeVisible();
      await undo.click();
      await expect.poll(() => reverts.length).toBe(1);
      expect(reverts[0]?.expectedVersion).toBe(8);
    });
  }
}
