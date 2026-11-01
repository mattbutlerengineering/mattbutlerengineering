import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
import { mockAvailability } from "./availability-draft-mock.js";

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

async function openDay(page: Page, label: RegExp) {
  await page.goto("availability");
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
    await page.goto("availability");
    const banner = page.getByRole("alert").filter({ hasText: "Couldn't load availability" });
    await expect(banner).toBeVisible({ timeout: NEVER_RETRIED });
    await expect(page.getByRole("button", { name: /^Close…/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pause online booking" })).toHaveCount(0);

    answering = true;
    await banner.getByRole("button", { name: "Retry" }).click();
    await expect(banner).toHaveCount(0);
    await page.getByRole("button", { name: /^Close…/ }).click();
    await expect(page.getByRole("dialog", { name: "Close", exact: true })).toBeVisible();
  });

  test("days: the banner stands above cells that have stopped waiting", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await page.route(`${base}/availability/days*`, (route) => route.fulfill(failure));
    await page.goto("availability");
    await expect(
      page.getByRole("alert").filter({ hasText: "Couldn't load availability" })
    ).toBeVisible({ timeout: NEVER_RETRIED });
    await expect(page.locator('[data-date] [class*="skeleton" i]')).toHaveCount(0);
  });

  test("Team: a banner with Retry", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await page.route(/\/api\/v1\/venues\/[^/?]+\/team$/, (route) => route.fulfill(failure));
    await page.goto("availability");
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

test.describe("Reload hours", () => {
  async function copyToMonday(page: Page) {
    await page.getByRole("button", { name: "Copy to other days…" }).click();
    const copy = page.getByRole("dialog", { name: /to other days/ });
    await copy.locator("label").filter({ hasText: /^Mon/ }).click();
    await copy.getByRole("button", { name: /^Copy to \d+/ }).click();
    await expect(copy).toHaveCount(0);
  }

  test("a normal reload moves nothing and offers no button", async ({ mockedPage: page }) => {
    const mock = await mockAvailability(page);
    await openDay(page, /Regular week/);
    const copy = page.getByRole("button", { name: "Copy to other days…" });
    const before = await copy.boundingBox();

    mock.holdReads();
    await copyToMonday(page);
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
    const mock = await mockAvailability(page);
    await openDay(page, /Regular week/);
    // A replica behind the writes: the read answers with a version older than the save.
    mock.readVersion = mock.version;
    await copyToMonday(page);
    const reload = page.getByRole("button", { name: "Reload hours" });
    await expect(reload).toBeVisible({ timeout: 4000 });

    mock.readVersion = null;
    await reload.click();
    await expect(reload).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit/ }).first()).toBeFocused();
  });
});

test("+ Add service on a closed day adds a row and moves focus into it", async ({
  mockedPage: page,
}) => {
  await mockAvailability(page, { weekdays: [1, 2, 3] });
  await page.goto("availability");
  await page.locator("[data-date]").first().waitFor();
  await page.locator('button[aria-label*="Closed"]').first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Add service" }).click();
  await expect(dialog.locator("fieldset")).toHaveCount(1);
  await expect(dialog.locator("fieldset input:focus")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /^Save/ })).toBeEnabled();
});

test("Close: a failed Next moves focus to the first problem", async ({ mockedPage: page }) => {
  await mockAvailability(page);
  await page.goto("availability");
  await page.getByRole("button", { name: "Pause online booking" }).click();
  const dialog = page.getByRole("dialog", { name: "Close", exact: true });
  await dialog
    .locator("label")
    .filter({ hasText: /^Online/ })
    .click();
  await dialog.getByTestId("close-primary").click();
  await expect(dialog.getByRole("checkbox", { name: "Online" })).toBeFocused();
});

test("Change regular week says why Save is off", async ({ mockedPage: page }) => {
  await mockAvailability(page);
  await page.goto("availability");
  await page.getByRole("button", { name: "Change regular week…" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Choose a start date to save.")).toBeVisible();
  await expect(drawer.getByRole("button", { name: /^Save/ })).toBeDisabled();
});

test("Change regular week offers no start date after the end date", async ({
  mockedPage: page,
}) => {
  await mockAvailability(page);
  await page.goto("availability");
  await page.getByRole("button", { name: "Change regular week…" }).click();
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
  await page.goto("availability");
  await page.getByRole("button", { name: "Create another schedule…" }).click();
  await page.getByRole("button", { name: "New schedule" }).click();
  await page.getByRole("textbox", { name: /Schedule name/ }).fill("Spare");
  await page.getByRole("combobox", { name: "Add service" }).click();
  await page.getByRole("option", { name: "A new service…" }).click();
  await page.getByRole("textbox", { name: /Service name/ }).fill("Brunch");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Spare saved")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => mock.reverts).toBe(1);
});
