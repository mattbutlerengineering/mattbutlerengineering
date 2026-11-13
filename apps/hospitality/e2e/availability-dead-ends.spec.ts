import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
import { mockAvailability } from "./availability-draft-mock.js";
import { localDay } from "./local-day.js";

/**
 * #7979: the places a Manager used to get stuck. A failed read says so with Retry, a stranded
 * refusal names each booking with a link to it, and nothing moves under the pointer or drops
 * focus while a reload settles.
 */

const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
const failure = {
  status: 500,
  contentType: "application/problem+json",
  body: JSON.stringify({ type: "about:blank", title: "Server", status: 500, detail: "boom" }),
};

const NEVER_RETRIED = 15_000;

/**
 * A week with a closed Sunday: Copy leaves out the days that already have the copied hours, so a
 * Copy that saves needs one day that differs.
 */
const COPYABLE = { weekdays: [1, 2, 3, 4, 5, 6] };

async function openDay(page: Page, label: RegExp) {
  await page.goto("availability?tab=calendar");
  await page.locator("[data-date]").first().waitFor();
  await page.getByRole("button", { name: label }).nth(20).click();
  return page.getByRole("dialog");
}

test.describe("a read that failed", () => {
  test("config: a banner with Retry, and no Close that cannot open", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    let answering = false;
    await page.route(`${base}/availability/config`, (route) =>
      answering ? route.fallback() : route.fulfill(failure)
    );
    await page.goto("availability?tab=calendar");
    const banner = page.getByRole("alert").filter({ hasText: "Couldn't load availability" });
    await expect(banner).toBeVisible({ timeout: NEVER_RETRIED });
    await expect(page.getByRole("button", { name: /^Close…/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pause online booking" })).toHaveCount(0);

    answering = true;
    await banner.getByRole("button", { name: "Retry" }).click();
    await expect(banner).toHaveCount(0);
    await page.getByRole("button", { name: /^Close…/ }).click();
    await expect(page.getByRole("dialog", { name: /^Close / })).toBeVisible();
  });

  test("days: the banner stands above cells that have stopped waiting", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await page.route(`${base}/availability/days*`, (route) => route.fulfill(failure));
    await page.goto("availability?tab=calendar");
    await expect(
      page.getByRole("alert").filter({ hasText: "Couldn't load availability" })
    ).toBeVisible({ timeout: NEVER_RETRIED });
    await expect(page.locator('[data-date] [class*="skeleton" i]')).toHaveCount(0);
  });

  test("Team: a banner with Retry", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await page.route(/\/api\/v1\/venues\/[^/?]+\/team$/, (route) => route.fulfill(failure));
    await page.goto("availability?tab=calendar");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Couldn't load availability" })
        .getByRole("button", { name: "Retry" })
    ).toBeVisible({ timeout: NEVER_RETRIED });
  });

  test("Timeline: Emergency close does not silently vanish", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    let answering = false;
    await page.route(`${base}/availability/config`, (route) =>
      answering ? route.fallback() : route.fulfill(failure)
    );
    await page.goto("timeline");
    const alert = page.getByRole("alert").filter({ hasText: "Emergency close" });
    await expect(alert).toBeVisible({ timeout: NEVER_RETRIED });
    answering = true;
    await alert.getByRole("button", { name: "Retry" }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tonight ▾" })).toBeVisible();
  });
});

test("a stranded refusal lists each booking, and its link opens that booking", async ({
  mockedPage: page,
  context,
}) => {
  const mock = await mockAvailability(page);
  const dialog = await openDay(page, /Regular week/);
  await dialog.getByRole("button", { name: /^Edit/ }).first().click();
  await dialog.getByRole("button", { name: /^Remove/ }).click();
  mock.nextPut = {
    status: 409,
    code: "stranded-bookings",
    extra: {
      reservations: [
        {
          id: "res-okafor",
          startTime: "2026-11-21T01:30:00.000Z",
          partySize: 4,
          reason: "closed",
          guestName: "Okafor",
          serviceDate: "2026-11-20",
        },
      ],
    },
  };
  await dialog.getByRole("button", { name: /^Save/ }).click();

  const link = dialog.getByRole("link", { name: /Okafor/ });
  await expect(link).toContainText("party of 4");
  const [opened] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await opened.waitForLoadState();
  expect(opened.url()).toContain("/hospitality/timeline?date=2026-11-20&selected=res-okafor");
  await opened.close();
  // The draft that was refused is still there.
  await expect(dialog.getByRole("button", { name: /^Save/ })).toBeEnabled();
});

test("a stranded list stays out of the alert, and a long name wraps", async ({
  mockedPage: page,
}) => {
  const mock = await mockAvailability(page);
  const dialog = await openDay(page, /Regular week/);
  await dialog.getByRole("button", { name: /^Edit/ }).first().click();
  await dialog.getByRole("button", { name: /^Remove/ }).click();
  mock.nextPut = {
    status: 409,
    code: "stranded-bookings",
    extra: {
      reservations: [
        {
          id: "res-long",
          startTime: "2026-11-21T01:30:00.000Z",
          partySize: 4,
          reason: "closed",
          guestName: "W".repeat(120),
          serviceDate: "2026-11-20",
        },
      ],
    },
  };
  await dialog.getByRole("button", { name: /^Save/ }).click();

  const link = dialog.getByRole("link", { name: /WWWW/ });
  await expect(link).toBeVisible();
  await expect(dialog.getByRole("alert").getByRole("link")).toHaveCount(0);
  const sideways = await link.evaluate((el) => {
    const list = el.closest("ul");
    return list ? list.scrollWidth - list.clientWidth : Number.POSITIVE_INFINITY;
  });
  expect(sideways).toBeLessThanOrEqual(0);
});

test.describe("Reload hours", () => {
  async function copyToOtherDays(page: Page) {
    await page.getByRole("button", { name: "Copy hours…" }).click();
    const copy = page.getByRole("dialog", { name: /to other days/ });
    // Every day: the copied hours reach the closed Sunday of that week (the days that already
    // have them are left out), so the copy saves a one-off for it.
    await copy.getByRole("button", { name: "Every day" }).click();
    await copy.getByRole("button", { name: /^Copy to / }).click();
    await expect(copy).toHaveCount(0);
  }

  test("a normal reload moves nothing and offers no button", async ({ mockedPage: page }) => {
    const mock = await mockAvailability(page, COPYABLE);
    await openDay(page, /Regular week/);
    const copy = page.getByRole("button", { name: "Copy hours…" });
    const before = await copy.boundingBox();

    mock.holdReads();
    await copyToOtherDays(page);
    await expect(page.getByText("Edit once the newest hours have loaded.")).toBeVisible();
    expect((await copy.boundingBox())?.y).toBe(before?.y);
    await expect(page.getByRole("button", { name: "Reload hours" })).toHaveCount(0);

    mock.releaseReads();
    await expect(page.getByText("Edit once the newest hours have loaded.")).toHaveCount(0);
    expect((await copy.boundingBox())?.y).toBe(before?.y);
  });

  test("a hold that lasts offers it, and a click that ends the hold lands on Edit", async ({
    mockedPage: page,
  }) => {
    const mock = await mockAvailability(page, COPYABLE);
    await openDay(page, /Regular week/);
    // A replica behind the writes: the read answers with a version older than the save.
    mock.readVersion = mock.version;
    await copyToOtherDays(page);
    const reload = page.getByRole("button", { name: "Reload hours" });
    await expect(reload).toBeVisible({ timeout: 4000 });

    mock.readVersion = null;
    await reload.click();
    await expect(reload).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit/ }).first()).toBeFocused();
  });

  test("a read answering after the Manager moved on leaves focus where it is", async ({
    mockedPage: page,
  }) => {
    const mock = await mockAvailability(page, COPYABLE);
    await openDay(page, /Regular week/);
    mock.holdReads();
    await copyToOtherDays(page);
    const reload = page.getByRole("button", { name: "Reload hours" });
    await expect(reload).toBeVisible({ timeout: 4000 });
    await reload.click();

    const copy = page.getByRole("button", { name: "Copy hours…" });
    await copy.focus();
    mock.releaseReads();
    await expect(reload).toHaveCount(0);
    await expect(copy).toBeFocused();
  });

  test("the hold ending under focus on Reload lands on Edit, with no click", async ({
    mockedPage: page,
  }) => {
    const mock = await mockAvailability(page, COPYABLE);
    await openDay(page, /Regular week/);
    mock.holdReads();
    await copyToOtherDays(page);
    const reload = page.getByRole("button", { name: "Reload hours" });
    await expect(reload).toBeVisible({ timeout: 4000 });
    await reload.focus();

    mock.releaseReads();
    await expect(reload).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit/ }).first()).toBeFocused();
  });

  test("a double-clicked Undo sends one revert and keeps focus in the drawer", async ({
    mockedPage: page,
  }) => {
    const mock = await mockAvailability(page, COPYABLE);
    const dialog = await openDay(page, /Regular week/);
    await copyToOtherDays(page);

    await page.getByRole("button", { name: "Undo" }).dblclick();
    await expect(page.getByText("Change undone")).toBeVisible();
    await expect.poll(() => mock.reverts).toBe(1);
    await expect(page.getByText(/Someone else/)).toHaveCount(0);
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  });
});

test("+ Add service on a closed day adds a row and moves focus into it", async ({
  mockedPage: page,
}) => {
  // A past date is read-only (#8752), so the closed day is today, with the clock held on it: the
  // venue opens on the three weekdays after today's, whichever weekday the run falls on.
  const today = localDay();
  await page.clock.setFixedTime(new Date(`${today}T12:00:00`));
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  await mockAvailability(page, { weekdays: [1, 2, 3].map((ahead) => (weekday + ahead) % 7) });
  await page.goto("availability?tab=calendar");
  await page.locator("[data-date]").first().waitFor();
  await page.locator(`button[data-date="${today}"][aria-label*="Closed"]`).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Add service" }).click();
  await expect(dialog.locator("fieldset")).toHaveCount(1);
  await expect(dialog.locator("fieldset input:focus")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /^Save/ })).toBeEnabled();
});

test("Close: a failed Next moves focus to the first problem", async ({ mockedPage: page }) => {
  await mockAvailability(page);
  await page.goto("availability?tab=calendar");
  await page.getByRole("button", { name: "Pause online booking" }).click();
  // Opened from Pause online booking, the dialog is titled for it, not "Close".
  const dialog = page.getByRole("dialog", { name: "Pause online booking", exact: true });
  // The channels sit behind What's Change.
  await dialog.getByRole("button", { name: "Change" }).click();
  await dialog
    .locator("label")
    .filter({ hasText: /^Online/ })
    .click();
  await dialog.getByTestId("close-primary").click();
  await expect(dialog.getByRole("checkbox", { name: "Online" })).toBeFocused();
});

test("Change regular week says why Save is off", async ({ mockedPage: page }) => {
  await mockAvailability(page);
  await page.goto("availability/calendar?tab=schedules");
  // The week panel's Starting later… opens Change regular week (the dated frame of the same form).
  await page.getByRole("button", { name: "Starting later…" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Choose a start date to save.")).toBeVisible();
  await expect(drawer.getByRole("button", { name: /^Save/ })).toBeDisabled();
});

test("Change regular week offers no start date after the end date", async ({
  mockedPage: page,
}) => {
  await mockAvailability(page);
  await page.goto("availability/calendar?tab=schedules");
  // The week panel's Starting later… opens Change regular week (the dated frame of the same form).
  await page.getByRole("button", { name: "Starting later…" }).click();
  const drawer = page.getByRole("dialog");
  // The picker's own day cells: the page calendar's date sits on a button inside its cell.
  const offeredDays = page.locator('[role="gridcell"][data-date]:not([aria-disabled]):visible');

  await drawer.getByRole("combobox", { name: "Ending" }).click();
  const end = offeredDays.nth(3);
  const endDate = (await end.getAttribute("data-date")) ?? "";
  await end.click();
  // Let the Ending panel finish closing, so only the Starting panel is counted.
  await expect(offeredDays).toHaveCount(0);
  await drawer.getByRole("combobox", { name: "Starting" }).click();
  await expect(offeredDays.first()).toBeVisible();
  const offered = await offeredDays.evaluateAll((cells) =>
    cells.map((cell) => cell.getAttribute("data-date") ?? "")
  );
  expect(offered).toContain(endDate);
  expect(offered.filter((date) => date > endDate)).toEqual([]);
});

test("Undo is offered after saving a new schedule, and reverts it", async ({
  mockedPage: page,
}) => {
  const mock = await mockAvailability(page);
  await page.goto("availability/calendar?tab=schedules");
  // Add a schedule… opens the schedule editor, seeded from the regular week.
  await page.getByRole("button", { name: "Add a schedule…" }).click();
  await page.getByRole("textbox", { name: /Schedule name/ }).fill("Spare");
  // The seeded service is named, so it offers no chips: rename it by hand.
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Service name" })
    .first()
    .fill("Brunch");
  await page.getByRole("dialog").getByRole("button", { name: "Weekdays", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Spare saved")).toBeVisible();
  // By keyboard, with the drawer that offered it gone: focus must not fall to the page body.
  await page.getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => mock.reverts).toBe(1);
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  expect(await page.evaluate(() => !!document.activeElement?.closest("main"))).toBe(true);
});

test("a refused Undo lists its bookings above the Close dialog that is open (#8042)", async ({
  mockedPage: page,
}) => {
  await mockAvailability(page, COPYABLE);
  await page.route("**/availability/changes/*/revert", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "stranded",
        code: "stranded-bookings",
        reservations: [
          {
            id: "res-okafor",
            startTime: "2026-11-21T01:30:00.000Z",
            partySize: 4,
            reason: "closed",
            guestName: "Okafor",
            serviceDate: "2026-11-20",
          },
        ],
      }),
    })
  );
  const day = await openDay(page, /Regular week/);
  await page.getByRole("button", { name: "Copy hours…" }).click();
  const copy = page.getByRole("dialog", { name: /to other days/ });
  await copy.getByRole("button", { name: "Every day" }).click();
  await copy.getByRole("button", { name: /^Copy to / }).click();
  await expect(copy).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(day).toHaveCount(0);
  await page.getByRole("button", { name: /^Close…/ }).click();
  await expect(page.getByRole("dialog", { name: /^Close / })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();

  const dialog = page.getByRole("dialog", { name: "These bookings would lose their service" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const onTop = await page.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.closest('[role="dialog"]')
        ?.textContent?.includes("lose their service") ?? false,
    { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + 30 }
  );
  expect(onTop).toBe(true);
  await expect(dialog.getByRole("link", { name: /Okafor/ })).toBeFocused();
});

test("a refused Undo names each stranded booking with a link, outside the alert (#8042)", async ({
  mockedPage: page,
}) => {
  await mockAvailability(page);
  await page.route("**/availability/changes/*/revert", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "stranded",
        code: "stranded-bookings",
        reservations: [
          {
            id: "res-okafor",
            startTime: "2026-11-21T01:30:00.000Z",
            partySize: 4,
            reason: "closed",
            guestName: "Okafor",
            serviceDate: "2026-11-20",
          },
        ],
      }),
    })
  );
  await page.goto("availability/calendar?tab=schedules");
  // Add a schedule… opens the schedule editor, seeded from the regular week.
  await page.getByRole("button", { name: "Add a schedule…" }).click();
  await page.getByRole("textbox", { name: /Schedule name/ }).fill("Spare");
  // The seeded service is named, so it offers no chips: rename it by hand.
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Service name" })
    .first()
    .fill("Brunch");
  await page.getByRole("dialog").getByRole("button", { name: "Weekdays", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Spare saved")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();

  const dialog = page.getByRole("dialog", { name: "These bookings would lose their service" });
  const link = dialog.getByRole("link", { name: /Okafor/ });
  await expect(link).toHaveAttribute("href", /timeline\?date=2026-11-20&selected=res-okafor$/);
  await expect(page.getByRole("alert").getByRole("link")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("the day drawer's Why this day reads in French (#8089)", async ({ mockedPage: page }) => {
  await page.addInitScript(() => localStorage.setItem("mbe-hospitality-locale", "fr-CA"));
  // A venue closure on every day, so each day has two layers and "Why this day" shows.
  await mockAvailability(page, {
    rules: [
      {
        id: "closed-always",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2020-01-01",
        repeat: { version: 1, weekdays: [0, 1, 2, 3, 4, 5, 6] },
      },
    ],
  });
  await page.goto("availability?tab=calendar");
  await page.locator("[data-date]").first().waitFor();
  await page.locator("button[data-date]").nth(20).click();
  const layers = page.getByRole("dialog").locator("ol li");
  await expect(layers.nth(0)).toContainText("Semaine habituelle");
  await expect(layers.nth(0)).toContainText("Dinner 17 h 00 – 23 h 00");
  await expect(layers.nth(1)).toContainText("Fermé");
  await expect(layers.nth(1)).toContainText("Toute la journée");
  await expect(page.getByRole("dialog").getByText("Regular week")).toHaveCount(0);
  await expect(page.getByRole("dialog").getByText("All day")).toHaveCount(0);
});

test("a refused reopen lists each booking with a link, outside its alert (#8043)", async ({
  mockedPage: page,
}) => {
  await mockAvailability(page, {
    rules: [
      {
        id: "xmas",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2031-12-24",
        endsOn: "2031-12-24",
      },
    ],
  });
  await page.route(`${base}/closures`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            ruleId: "xmas",
            total: 2,
            cancelled: 2,
            sent: 0,
            rebooked: 0,
            unreachable: 0,
            refundFailed: 0,
            refundFailures: [],
            refundPending: 0,
          },
        ],
      }),
    })
  );
  const stranded = (id: string, guestName: string, startTime: string) => ({
    path: `reservations.${id}`,
    code: "strands_booking",
    message: "Removing this would leave this booking without service.",
    reservation: {
      id,
      startTime,
      partySize: 4,
      reason: "closed",
      guestName,
      serviceDate: "2031-12-24",
    },
  });
  await page.route(`${base}/closures/xmas`, (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "about:blank",
        title: "Unprocessable",
        status: 422,
        detail: "The closure is not valid.",
        code: "invalid-config",
        issues: [
          stranded("res-okafor", "Okafor", "2031-12-25T02:30:00.000Z"),
          stranded("res-lindqvist", "Lindqvist", "2031-12-25T03:00:00.000Z"),
          {
            path: "reservations.res-3",
            code: "strands_booking",
            message: "Removing this would leave this booking without service.",
          },
        ],
      }),
    })
  );
  await page.goto("availability?tab=calendar");
  await page.getByRole("radio", { name: "Special dates" }).click({ force: true });
  await page.getByRole("button", { name: /^Remove closure for/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Reopen", exact: true }).click();

  const alert = dialog.getByRole("alert");
  await expect(alert).toContainText("3 bookings would be left without service");
  const link = dialog.getByRole("link", { name: /Okafor/ });
  await expect(link).toHaveAttribute("href", /timeline\?date=2031-12-24&selected=res-okafor$/);
  await expect(dialog.getByRole("link", { name: /Lindqvist/ })).toBeVisible();
  await expect(dialog.getByText("and 1 more not listed")).toBeVisible();
  // The list is outside the live region, so a long one is not read out whole.
  await expect(alert.getByRole("link")).toHaveCount(0);
});
