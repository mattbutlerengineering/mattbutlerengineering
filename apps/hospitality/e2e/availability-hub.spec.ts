import type { Locator, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";
import { buildAvailabilityConfigFixture, buildVenueTeamFixture, loadFixture } from "./api-mocks.js";
import { mockClosures } from "./helpers/close-mock.js";
import { countFirstPaintControls } from "./helpers/first-paint.js";
import { countInteractions } from "./helpers/interaction-counter.js";
import { localDay } from "./local-day.js";

/**
 * The Availability hub (docs/features/availability-hub, breakdown H1.6): the landing page of
 * Availability. It lists what is set up in five rows, in the order they win, and says which rule
 * decides a date. The demo venue is `mockApi`'s (Lunch and Dinner every day) with one special date
 * on the next Dec 24, as in the ux.md hub sketch.
 */

/** The date check's calendar button, which `first-paint.ts` counts and ux.md's budget does not. */
const DATE_FIELD_BUTTON = 1;

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

    // First paint: 10 controls plus one per service (two here) by ux.md, which counts the date
    // field once; `first-paint.ts` also counts its calendar button (not a tab stop), so +1. C2.4's
    // "Close or pause" is one of ux.md's 10. Measured 13; whether the budget is restated or the
    // counter skips that button is the Owner's open question (breakdown Notes, 2026-11-13).
    const { count, controls } = await countFirstPaintControls(page, null);
    test.info().annotations.push({
      type: "hub first paint controls (agent stand-in)",
      description: `${count}: ${controls.join(" | ")}`,
    });
    expect(count, controls.join("\n")).toBeLessThanOrEqual(DATE_FIELD_BUTTON + 10 + 2);
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
    expect(count, controls.join("\n")).toBeLessThanOrEqual(DATE_FIELD_BUTTON + 10 + 2);
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

/**
 * Close and Pause from the address (breakdown C2.4): the layout hosts both dialogs from `?close=`
 * and `?pause=1`, over the hub or any other view. The closure endpoints are `mockClosures`'s, so
 * a saved closure comes back in the config and row 4 reads it without a reload.
 */
test.describe("Availability hub: Close and Pause", () => {
  const menu = (page: Page) => page.getByRole("button", { name: "Close or pause" });
  const closeDialog = (page: Page) => page.getByRole("dialog", { name: /^Close / });
  const dateField = (page: Page) => page.getByRole("combobox", { name: "Date", exact: true });
  const endField = (page: Page) => page.getByRole("combobox", { name: "End date (optional)" });

  /** A day of next month: one "Next" away on the calendar, clear of any zone's day boundary. */
  function nextMonth(day: number): string {
    const [year, month] = localDay().split("-").map(Number) as [number, number];
    return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
  }

  async function mockBarSection(page: Page): Promise<void> {
    await page.route(/\/api\/v1\/floor-plan-sections(\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "sec-bar",
              venueId: "ven_e2e_001",
              floorPlanId: "fp_e2e_001",
              name: "Bar",
              color: "#8b7355",
              displayOrder: 0,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      })
    );
  }

  test("pausing online booking tonight is 3 steps from the hub, and row 4 reads it at once", async ({
    mockedPage: page,
  }) => {
    const closures = await mockClosures(page);
    await openHub(page);
    const counter = countInteractions(page);

    await menu(counter.page).click();
    await counter.page.getByRole("menuitem", { name: "Pause online booking" }).click();
    const dialog = page.getByRole("dialog", { name: "Pause online booking" });
    await expect(page).toHaveURL(/\/availability\?pause=1$/);
    // PRD 18: focus is inside the dialog, on Tonight, which is already chosen.
    await expect(dialog.getByRole("radio", { name: "Tonight" })).toBeFocused();
    await counter.page.getByRole("button", { name: "Pause until tonight ends" }).click();

    await expect.poll(() => closures.saved()).not.toBeNull();
    // PRD 7: target 3 (walkthrough 13).
    expect(counter.count()).toBe(3);
    expect(closures.saved()).toMatchObject({
      rule: { kind: "closure", targetKind: "booking", bookingTypes: ["online"] },
    });
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/availability$/);
    await expect(menu(page)).toBeFocused();
    await expect(row(page, 4)).toContainText("Online booking paused until tonight ends");
    const notifications = page.getByRole("region", { name: "Notifications" });
    await expect(notifications.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  test("closing one date is at most 5 steps, and a week is counted, both typed from the hub", async ({
    mockedPage: page,
  }) => {
    const closures = await mockClosures(page);
    const posted: Array<{ rule: { startsOn: string; endsOn: string | null } }> = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/closures$/.test(request.url())) {
        posted.push(request.postDataJSON());
      }
    });
    await openHub(page);

    const one = countInteractions(page);
    await menu(one.page).click();
    await one.page.getByRole("menuitem", { name: "Close the venue or part of it" }).click();
    await expect(page).toHaveURL(/\/availability\?close=venue$/);
    // PRD 18: focus opens on the date, inside the dialog.
    await expect(
      closeDialog(page).getByRole("combobox", { name: "Date", exact: true })
    ).toBeFocused();
    const day = nextMonth(15);
    await dateField(one.page).fill(day);
    await dateField(one.page).press("Enter");
    await one.page.getByTestId("close-primary").click();
    await expect.poll(() => closures.saved()).not.toBeNull();
    // PRD 7: target at most 5 (walkthrough 11): the typed date is a fill and an Enter.
    expect(one.count()).toBeLessThanOrEqual(5);
    expect(closures.saved()).toMatchObject({ rule: { startsOn: day, endsOn: day } });
    await expect(closeDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/availability$/);
    await expect(menu(page)).toBeFocused();

    const week = countInteractions(page);
    await menu(week.page).click();
    await week.page.getByRole("menuitem", { name: "Close the venue or part of it" }).click();
    const from = nextMonth(20);
    const to = nextMonth(26);
    await dateField(week.page).fill(from);
    await dateField(week.page).press("Enter");
    await endField(week.page).fill(to);
    // Enter reads the end date, and the End field becomes the range's To on that keydown, so a
    // Locator press would retry on the detached field. Pressed on the page, counted by hand.
    await page.keyboard.press("Enter");
    const typedEnter = 1;
    await expect(page.getByTestId("close-primary")).toContainText(" – ");
    await week.page.getByTestId("close-primary").click();
    await expect.poll(() => posted.length).toBe(2);
    expect(posted[1]).toMatchObject({ rule: { startsOn: from, endsOn: to } });
    // PRD 7: target at most 6 (walkthrough 12), which counts each typed date as one step. This
    // counter counts a fill and its Enter apart, so the same 5 steps measure 7 (breakdown Notes).
    const steps = week.count() + typedEnter;
    test.info().annotations.push({
      type: "close for a week, interactions (agent stand-in)",
      description: `${steps} (ux.md walkthrough 12 counts 5 steps)`,
    });
    expect(steps).toBe(7);
  });

  test("each close target opens Close prefilled, and Back closes it with the selection kept", async ({
    mockedPage: page,
  }) => {
    await mockClosures(page);
    await mockBarSection(page);
    const a = nextMonth(15);
    const b = nextMonth(16);
    const when = (d: Locator) => d.getByRole("combobox", { name: "When" });
    const checks: ReadonlyArray<readonly [string, (d: Locator) => Promise<void>]> = [
      ["venue", (d) => expect(d.getByTestId("close-primary")).toHaveText("Choose a date")],
      [
        "tonight",
        (d) =>
          expect(d.getByRole("button", { name: "Tonight" })).toHaveAttribute(
            "aria-pressed",
            "true"
          ),
      ],
      [
        a,
        (d) => expect(d.getByRole("combobox", { name: "Date", exact: true })).not.toHaveValue(""),
      ],
      [`${a}..${b}`, (d) => expect(when(d)).toHaveText("Date range")],
      [`dates:${a},${b}`, (d) => expect(when(d)).toHaveText("Several dates")],
      [
        "section:sec-bar",
        (d) => expect(d.getByText("One section: Bar", { exact: true })).toBeVisible(),
      ],
    ];
    for (const [target, check] of checks) {
      await page.goto(`availability?close=${target}`);
      await expect(closeDialog(page)).toBeVisible();
      await check(closeDialog(page));
    }

    // Opened from a selection on the calendar, Back closes Close and the selection is still there.
    await page.goto("availability/calendar?tab=calendar");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.locator(`[data-date="${a}"]`).click({ modifiers: ["ControlOrMeta"] });
    await page.locator(`[data-date="${b}"]`).click({ modifiers: ["ControlOrMeta"] });
    const bar = page.getByRole("group", { name: "Selected dates" });
    await bar.getByRole("button", { name: "Close…" }).click();
    await expect(closeDialog(page).getByRole("button", { name: "Close 2 dates" })).toBeVisible();
    await page.goBack();
    await expect(closeDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/availability\/calendar\?tab=calendar$/);
    await expect(bar).toContainText("2 dates selected");
  });

  test("a Host with ?close=tonight or ?pause=1 gets no dialog, and the param goes", async ({
    mockedPage: page,
  }) => {
    await viewAsHost(page);
    await mockClosures(page);
    for (const search of ["?close=tonight", "?pause=1"]) {
      await page.goto(`availability${search}`);
      await expect(rowsHeading(page)).toBeVisible();
      await expect(page).toHaveURL(/\/availability$/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(menu(page)).toHaveCount(0);
    }
  });
});
