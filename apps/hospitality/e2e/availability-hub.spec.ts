import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";
import { buildAvailabilityConfigFixture, buildVenueTeamFixture, loadFixture } from "./api-mocks.js";
import type { AvailabilityConfig } from "@mbe/types";
import { countFirstPaintControls } from "./helpers/first-paint.js";
import { countInteractions } from "./helpers/interaction-counter.js";
import { createSharedConfig, serveSharedConfig } from "./helpers/shared-config-mock.js";
import { localDay } from "./local-day.js";

/**
 * The Availability hub (docs/features/availability-hub, breakdown H1.6): the landing page of
 * Availability. It lists what is set up in five rows, in the order they win, and says which rule
 * decides a date. The demo venue is `mockApi`'s (Lunch and Dinner every day) with one special date
 * on the next Dec 24, as in the ux.md hub sketch.
 */

const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 820, height: 1180 };
const PHONE = { width: 375, height: 812 };

const ROWS = [
  "Regular hours",
  "Seasonal hours",
  "Special dates and holidays",
  "Closures and pauses",
  "Booking rules",
];

const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;

/** The next Dec 24, today included: a year is always typed, so the answer is the same all year. */
function nextChristmasEve(): string {
  const today = localDay();
  const thisYear = `${today.slice(0, 4)}-12-24`;
  return today <= thisYear ? thisYear : `${Number(today.slice(0, 4)) + 1}-12-24`;
}

const DEC_24 = nextChristmasEve();
/** "Thu, Dec 24": the date as the sentence opens with it. */
const DEC_24_TEXT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
}).format(new Date(`${DEC_24}T00:00:00Z`));
const DEC_24_TYPED = `12/24/${DEC_24.slice(0, 4)}`;

/** The demo venue: the regular week `mockApi` serves, plus Dinner 4:00 PM to 8:00 PM on Dec 24. */
async function mockDemoVenue(page: Page): Promise<void> {
  const fixture = buildAvailabilityConfigFixture();
  const special = {
    id: "dr-dec-24",
    kind: "special_hours",
    targetKind: "venue",
    startsOn: DEC_24,
    endsOn: DEC_24,
    payload: {
      version: 1,
      services: [
        {
          venueServiceId: "vs-dinner",
          opensAt: 960,
          lastSeatingAt: 1140,
          closesAt: 1200,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online", "phone"],
        },
      ],
    },
  };
  await page.route(`${base}/availability/config`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { ...fixture, config: { ...fixture.config, dateRules: [special] } },
      }),
    });
  });
}

async function viewAsHost(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/venues\/[^/?]+\/team$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { ...buildVenueTeamFixture(), viewerRole: "host" } }),
    })
  );
}

const row = (page: Page, n: number) => page.getByTestId(`hub-row-${n}`);
const rowsHeading = (page: Page) => page.getByRole("heading", { level: 2, name: "Your rules" });

/** Opens the hub and waits until the role has settled and the rows have painted. */
async function openHub(page: Page, viewport = DESKTOP): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("availability");
  await expect(rowsHeading(page)).toBeVisible();
}

/** How many viewports tall the hub is: the bottom of its last control over the viewport height. */
async function screensTall(page: Page, viewport: { height: number }): Promise<number> {
  const main = page.locator("main#main-content");
  const scrolled = await main.evaluate((el) => el.scrollTop);
  const box = await page.getByRole("link", { name: "History" }).boundingBox();
  if (!box) throw new Error("the hub's History link has no box");
  return (box.y + box.height + scrolled) / viewport.height;
}

test.describe("Availability hub", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await mockDemoVenue(mockedPage);
  });

  test("a Manager reads the five rows in order, checks Dec 24, and every action leads to a view that renders", async ({
    mockedPage: page,
  }) => {
    await openHub(page);
    await expect(page).toHaveURL(/\/availability$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Availability");
    await expect(page.getByText("Later rules win on the dates they cover.")).toBeVisible();
    const rules = page.getByRole("list", { name: "Your rules" });
    await expect(rules.getByRole("heading", { level: 3 })).toHaveText(ROWS);

    // First paint: at most 10 controls plus one per service (two here), within one screen.
    const { count, controls } = await countFirstPaintControls(page, null);
    test.info().annotations.push({
      type: "hub first paint controls (agent stand-in)",
      description: `${count}: ${controls.join(" | ")}`,
    });
    expect(count, controls.join("\n")).toBeLessThanOrEqual(10 + 2);
    expect(await screensTall(page, DESKTOP)).toBeLessThanOrEqual(1.0);

    // The date check: one typed date, one sentence, and the row that decided it is marked in text.
    await expect(page.getByText(/^decides /)).toHaveCount(0);
    const field = page.getByRole("combobox", { name: "Check a date" });
    await field.fill(DEC_24_TYPED);
    await field.press("Enter");
    await expect(page.getByTestId("hub-date-answer")).toContainText(
      `${DEC_24_TEXT}: Dinner 4:00 PM–8:00 PM. Decided by your special date, which wins over your regular hours.`
    );
    await expect(row(page, 3).getByText("decides Dec 24")).toBeVisible();
    await expect(page.getByText(/^decides /)).toHaveCount(1);

    // Each service's line and each row's action is a link built by the address module.
    const special = /\/availability\/calendar\?tab=special$/;
    const edit = (n: number, name: string) => row(page, n).getByRole("link", { name });
    await expect(row(page, 1).getByRole("link", { name: /^Lunch / })).toHaveAttribute(
      "href",
      /\/availability\/hours\?service=vs-lunch$/
    );
    await expect(row(page, 1).getByRole("link", { name: /^Dinner / })).toHaveAttribute(
      "href",
      /\/availability\/hours\?service=vs-dinner$/
    );
    await expect(edit(4, "View Closures and pauses")).toHaveAttribute("href", special);
    await expect(edit(5, "Edit Booking rules")).toHaveAttribute(
      "href",
      /\/availability\/booking-rules$/
    );

    // PRD 17: every address a row leads to renders a view. The other links share these addresses.
    const layer = (name: string) => page.getByRole("radio", { name });
    const back = async () => {
      await page.goBack();
      await expect(rowsHeading(page)).toBeVisible();
    };
    await edit(1, "Edit Regular hours").click();
    await expect(page.getByRole("heading", { level: 1, name: "Regular hours" })).toBeVisible();
    await back();
    await edit(2, "Add Seasonal hours").click();
    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: /Schedule name/ })
    ).toBeVisible();
    // Today's page spends `action` with a replace, so one Back still returns to the hub.
    await back();
    await edit(3, "Edit Special dates and holidays").click();
    await expect(layer("Special dates")).toBeChecked();
    await back();
    await page.getByRole("link", { name: "Open calendar" }).click();
    await expect(layer("Calendar")).toBeChecked();
    await back();
    await page.getByRole("link", { name: "History" }).click();
    await expect(page).toHaveURL(/\/availability\/calendar$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Availability");
  });

  test("a Host reads the same rows and sees no edit control", async ({ mockedPage: page }) => {
    await viewAsHost(page);
    await openHub(page);
    await expect(
      page.getByRole("list", { name: "Your rules" }).getByRole("heading", { level: 3 })
    ).toHaveText(ROWS);
    await expect(page.getByRole("main").getByRole("link", { name: /^(Edit|Add) / })).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("button", { name: /Edit|Add|Close|Pause/ })
    ).toHaveCount(0);
    for (const n of [1, 2, 5]) await expect(row(page, n).getByRole("link")).toHaveCount(0);
    await expect(
      row(page, 3).getByRole("link", { name: "View Special dates and holidays" })
    ).toBeVisible();
    await expect(
      row(page, 4).getByRole("link", { name: "View Closures and pauses" })
    ).toBeVisible();
    // Reading is not editing: a Host still checks a date.
    const field = page.getByRole("combobox", { name: "Check a date" });
    await field.fill(DEC_24_TYPED);
    await field.press("Enter");
    await expect(row(page, 3).getByText("decides Dec 24")).toBeVisible();
  });

  for (const [name, viewport] of [
    ["desktop", DESKTOP],
    ["tablet", TABLET],
    ["phone", PHONE],
  ] as const) {
    test(`has no axe violation and no sideways scroll on a ${name} (${viewport.width}px)`, async ({
      mockedPage: page,
    }) => {
      await openHub(page, viewport);
      // With an answer on screen, so the sentence and the marker are checked too.
      const field = page.getByRole("combobox", { name: "Check a date" });
      await field.fill(DEC_24_TYPED);
      await field.press("Enter");
      await expect(row(page, 3).getByText("decides Dec 24")).toBeVisible();

      const results = await new AxeBuilder({ page }).include("main").analyze();
      expect(results.violations).toEqual([]);
      const overflow = await page
        .locator("main#main-content")
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("on a 375x812 phone the first paint stays within the budget and a screen and a half", async ({
    mockedPage: page,
  }) => {
    await openHub(page, PHONE);
    const { count, controls } = await countFirstPaintControls(page, null);
    expect(count, controls.join("\n")).toBeLessThanOrEqual(10 + 2);
    expect(await screensTall(page, PHONE)).toBeLessThanOrEqual(1.5);
  });
});

/** Booking rules (breakdown C2.5): a drawer over the hub at its own address. */
test.describe("Availability hub: Booking rules", () => {
  const drawer = (page: Page) => page.getByRole("dialog", { name: "Booking rules" });
  const daysAhead = (page: Page) => drawer(page).getByLabel("How far ahead guests can book (days)");

  async function capturePatches(page: Page): Promise<Array<Record<string, unknown>>> {
    const patches: Array<Record<string, unknown>> = [];
    await page.route(/\/api\/v1\/venues\/[^/?]+$/, (route) => {
      if (route.request().method() === "PATCH") patches.push(route.request().postDataJSON());
      return route.fallback();
    });
    return patches;
  }

  test("changing how far ahead guests book is 3 steps from the hub, and the save offers Undo", async ({
    mockedPage: page,
  }) => {
    await mockDemoVenue(page);
    const patches = await capturePatches(page);
    await openHub(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("link", { name: "Edit Booking rules" }).click();
    await expect(page).toHaveURL(/\/availability\/booking-rules$/);
    // PRD 18: focus is inside the drawer once it has opened.
    await expect(drawer(page).locator(":focus")).toHaveCount(1);
    await expect(drawer(page).getByText("Changes here are not listed in History.")).toBeVisible();
    await daysAhead(counter.page).fill("60");
    await drawer(counter.page).getByRole("button", { name: "Save", exact: true }).click();

    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toMatchObject({ settings: { maxAdvanceBooking: 60 } });
    // PRD 7: target 3 (walkthrough 14). Baseline 4.
    expect(counter.count()).toBe(3);
    await expect(page).toHaveURL(/\/availability$/);
    await expect(drawer(page)).toHaveCount(0);
    const notifications = page.getByRole("region", { name: "Notifications" });
    await expect(notifications.getByText("Booking rules saved")).toBeVisible();
    await expect(notifications.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  test("leaving the drawer with an unsaved change asks first", async ({ mockedPage: page }) => {
    await mockDemoVenue(page);
    const patches = await capturePatches(page);
    await openHub(page);
    await page.getByRole("link", { name: "Edit Booking rules" }).click();
    await daysAhead(page).fill("60");

    const prompt = page.getByRole("alertdialog", { name: "Discard your changes?" });
    await drawer(page).getByRole("button", { name: "Cancel" }).click();
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: "Keep editing" }).click();
    await expect(prompt).toHaveCount(0);
    await expect(page).toHaveURL(/\/availability\/booking-rules$/);
    await expect(daysAhead(page)).toHaveValue("60");

    // Browser Back asks too, and Discard returns to the hub with nothing saved.
    await page.goBack();
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: "Discard" }).click();
    await expect(page).toHaveURL(/\/availability$/);
    await expect(drawer(page)).toHaveCount(0);
    await expect(rowsHeading(page)).toBeVisible();
    expect(patches).toEqual([]);
  });
});

/** Regular hours (breakdown E4.4): a page of its own, opened from hub row 1. */
test.describe("Availability hub: Regular hours", () => {
  const saveBar = (page: Page) => page.getByTestId("editor-save-bar");
  const saveButton = (page: Page) => saveBar(page).getByRole("button", { name: /^Save/ });

  /** The demo venue's week, held in memory so a save is read back; Undo's revert is counted. */
  async function serveWeek(page: Page) {
    const store = createSharedConfig(buildAvailabilityConfigFixture().config as AvailabilityConfig);
    await serveSharedConfig(page, store);
    const reverts: string[] = [];
    await page.route(`${base}/availability/changes/*/revert`, (route) => {
      reverts.push(route.request().url());
      store.version += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { version: store.version, changeId: "change-undo" } }),
      });
    });
    return { store, reverts };
  }

  /** How many viewports tall the page's content is (the main area is the scroll container). */
  const pageScreens = (page: Page) =>
    page.evaluate(() => {
      const main = document.querySelector("main#main-content");
      if (!main) throw new Error("no <main id=main-content> on the page");
      const bottom = Math.max(
        document.documentElement.scrollHeight,
        main.scrollHeight + main.getBoundingClientRect().top
      );
      return bottom / window.innerHeight;
    });

  test("walkthrough 10: Dinner's close in 4 steps, with Save 6 Tabs away, and back to row 1 with Undo", async ({
    mockedPage: page,
  }) => {
    const { store, reverts } = await serveWeek(page);
    await openHub(page);
    const counter = countInteractions(page);

    await counter.page
      .getByTestId("hub-row-1")
      .getByRole("link", { name: /^Dinner / })
      .click();
    await expect(page).toHaveURL(/\/availability\/hours\?service=vs-dinner$/);
    await expect(page.getByRole("heading", { level: 1, name: "Regular hours" })).toBeVisible();
    const closes = page.getByRole("combobox", { name: "Closes" });
    await expect(closes).toHaveCount(1);
    await counter.page.getByRole("combobox", { name: "Closes" }).click();
    await counter.page
      .getByRole("listbox", { name: "Closes" })
      .getByRole("option", { name: "11:30 PM", exact: true })
      .click();
    await expect(saveButton(page)).toBeEnabled();

    // PRD 7: the form after one edit, at most 30 controls within 1.5 screens.
    const { count, controls } = await countFirstPaintControls(page, null);
    test.info().annotations.push({
      type: "regular hours controls after one edit",
      description: `${count}: ${controls.join(" | ")}`,
    });
    expect(count, controls.join("\n")).toBeLessThanOrEqual(30);
    expect(await pageScreens(page)).toBeLessThanOrEqual(1.5);

    // PRD 8 / ux.md: the save bar is the next Tab stop after the open service.
    await closes.focus();
    let presses = 0;
    const onSave = () =>
      page.evaluate(() => {
        const active = document.activeElement;
        return (
          !!active?.closest('[data-testid="editor-save-bar"]') &&
          /^Save/.test(active.textContent?.trim() ?? "")
        );
      });
    while (!(await onSave()) && presses < 20) {
      await page.keyboard.press("Tab");
      presses += 1;
    }
    expect(presses).toBeLessThanOrEqual(6);

    await counter.page.getByTestId("editor-save-bar").getByRole("button", { name: "Save" }).click();
    await expect.poll(() => store.configPuts.length).toBe(1);
    // Walkthrough 10: target 4 (baseline 3).
    expect(counter.count()).toBeLessThanOrEqual(4);

    await expect(page).toHaveURL(/\/availability$/);
    await expect(page.getByTestId("hub-row-1").locator(":focus")).toHaveCount(1);
    await expect(page.getByTestId("hub-row-1")).toContainText("11:30 PM");
    const notifications = page.getByRole("region", { name: "Notifications" });
    await notifications.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => reverts.length).toBe(1);
  });

  test("walkthroughs 5 and 1 in 7 steps each, and leaving with a draft asks first", async ({
    mockedPage: page,
  }) => {
    const { store } = await serveWeek(page);
    await openHub(page);

    // Walkthrough 5: Dinner seats every 30 minutes and takes phone bookings only.
    const five = countInteractions(page);
    await five.page
      .getByTestId("hub-row-1")
      .getByRole("link", { name: /^Dinner / })
      .click();
    await five.page.getByRole("button", { name: "More options" }).click();
    await five.page.getByRole("combobox", { name: "Seat every" }).click();
    await five.page.getByRole("option", { name: "30 min", exact: true }).click();
    await five.page.getByRole("combobox", { name: "Booked by" }).click();
    await five.page.getByRole("option", { name: "Phone only", exact: true }).click();
    await five.page.getByTestId("editor-save-bar").getByRole("button", { name: "Save" }).click();
    await expect.poll(() => store.configPuts.length).toBe(1);
    expect(five.count()).toBeLessThanOrEqual(7);
    const dinnerRows = (store.configPuts[0]?.changes.upsert.scheduleServices ?? []).filter(
      (row) => row.venueServiceId === "vs-dinner"
    );
    expect(dinnerRows.length).toBeGreaterThan(0);
    for (const row of dinnerRows) {
      expect(row.seating).toEqual({ version: 1, interval: 30 });
      expect(row.bookingTypes).toEqual(["phone"]);
    }
    await expect(page).toHaveURL(/\/availability$/);

    // Walkthrough 1: weekend Brunch beside every-day Lunch, the overlap fixed in one press.
    const one = countInteractions(page);
    await one.page.getByRole("link", { name: "Edit Regular hours" }).click();
    await one.page.getByRole("button", { name: "Add another service" }).click();
    await one.page.getByRole("button", { name: "Brunch", exact: true }).click();
    // Lunch is open too: its overlap with Brunch holds it open. Brunch's row is the last.
    await one.page.getByRole("button", { name: "Different days for this service" }).last().click();
    await one.page.getByRole("button", { name: "Weekends", exact: true }).first().click();
    await one.page.getByRole("button", { name: "Run Lunch on weekdays only" }).click();
    await one.page.getByTestId("editor-save-bar").getByRole("button", { name: "Save" }).click();
    await expect.poll(() => store.configPuts.length).toBe(2);
    expect(one.count()).toBeLessThanOrEqual(7);
    expect(store.config.venueServices.map((s) => s.name)).toContain("Brunch");
    await expect(page).toHaveURL(/\/availability$/);

    // PRD 11: leaving with a draft asks first, and Keep editing keeps it.
    await page.getByRole("link", { name: "Edit Regular hours" }).click();
    await page.getByRole("button", { name: "Add another service" }).click();
    await page.getByRole("link", { name: "Back to Availability" }).click();
    const prompt = page.getByRole("alertdialog", { name: "Discard your changes?" });
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: "Keep editing" }).click();
    await expect(page).toHaveURL(/\/availability\/hours$/);
    expect(store.configPuts).toHaveLength(2);
  });
});
