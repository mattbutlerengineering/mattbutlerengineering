import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";
import { buildAvailabilityConfigFixture, buildVenueTeamFixture, loadFixture } from "./api-mocks.js";
import { countFirstPaintControls } from "./helpers/first-paint.js";
import { countInteractions } from "./helpers/interaction-counter.js";
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
    const schedules = /\/availability\/calendar\?tab=schedules$/;
    const special = /\/availability\/calendar\?tab=special$/;
    const edit = (n: number, name: string) => row(page, n).getByRole("link", { name });
    await expect(row(page, 1).getByRole("link", { name: /^Lunch / })).toHaveAttribute(
      "href",
      schedules
    );
    await expect(row(page, 1).getByRole("link", { name: /^Dinner / })).toHaveAttribute(
      "href",
      schedules
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
    await expect(layer("Schedules")).toBeChecked();
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
    // History is a drawer over the hub at its own address (C2.6); Back closes it.
    await page.getByRole("link", { name: "History" }).click();
    await expect(page).toHaveURL(/\/availability\/history$/);
    await expect(page.getByRole("dialog", { name: "History" })).toBeVisible();
    await back();
    await expect(page.getByRole("dialog", { name: "History" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "History" })).toBeFocused();
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

test.describe("History over the hub (C2.6)", () => {
  test("loading its address opens the drawer with focus inside, and View day opens that day on the calendar", async ({
    mockedPage: page,
  }) => {
    await mockDemoVenue(page);
    const day = localDay(5);
    await page.route(`${base}/availability/changes*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            total: 1,
            offset: 0,
            items: [
              {
                id: "chg-1",
                actorId: "auth0|someone-else",
                at: new Date().toISOString(),
                kind: "config",
                summary: "Availability updated: 1 added, 0 changed, 0 removed",
                affectedFrom: day,
                affectedTo: day,
                notifiedGuests: false,
                revertedById: null,
                revertible: true,
              },
            ],
          },
        }),
      })
    );
    await page.setViewportSize(DESKTOP);
    await page.goto("availability/history");
    const history = page.getByRole("dialog", { name: "History" });
    await expect(history).toBeVisible();
    // PRD 18: focus is inside the drawer, and the hub is beneath it.
    await expect(history.locator(":focus")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Availability");
    await expect(history.getByRole("button", { name: "Undo" })).toBeVisible();

    await history.getByRole("button", { name: "View day" }).click();
    const dayName = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${day}T00:00:00Z`));
    await expect(page.getByRole("dialog", { name: new RegExp(dayName) })).toBeVisible();
    // The page reads ?date= once and drops it, so a reload does not reopen the day.
    await expect(page).toHaveURL(/\/availability\/calendar\?tab=calendar$/);
  });
});
