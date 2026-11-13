import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import type { AvailabilityConfig } from "@mbe/types";
import { test, expect } from "./fixtures.js";
import { buildAvailabilityConfigFixture, buildVenueTeamFixture, mockApi } from "./api-mocks.js";
import { countInteractions, type InteractionCounter } from "./helpers/interaction-counter.js";
import { firstPaint } from "./helpers/scenario-fixtures.js";
import {
  createSharedConfig,
  serveSharedConfig,
  type SharedConfigStore,
} from "./helpers/shared-config-mock.js";

/**
 * Holiday decisions that stick, and Copy that says what it does (docs/features/
 * availability-holidays-copy: prd.md criteria 1-3, 5, 6, 8-10; ux.md F1, F2). Each scenario starts
 * on `/availability` first paint and counts Locator actions through `countInteractions`; counts
 * are agent stand-in evidence, not a timed walkthrough, and are recorded as annotations.
 *
 * Today is pinned to Sun, Nov 8, 2026, 12:00 PM (US holidays). One in-memory venue
 * (`helpers/shared-config-mock.ts`) serves the config, the days and the holiday decisions to every
 * page a test opens, so two browser contexts are two Managers on one venue.
 *
 * "Before" counts were measured on the base of this run (the Plan all sheet and the old Copy
 * dialog, availability-phone-tonight @ 9ad5f14a7) with the same counter, from first paint.
 */

const BEFORE = { H1: 6, H2: 2, H3: 5, K1: 6, K2: 8 } as const;
const NOON = new Date("2026-11-08T12:00:00");
const DEC_FIRST = new Date("2026-12-01T12:00:00");

function record(name: string, count: number, budget: number, before?: number): void {
  test.info().annotations.push({
    type: "interactions (agent stand-in)",
    description: `${name}: ${count} of ${budget}${before === undefined ? "" : ` (before ${before})`}`,
  });
  expect(count, `${name} interactions`).toBeLessThanOrEqual(budget);
}

/** F-one: Lunch and Dinner every day. */
function fOneConfig(): AvailabilityConfig {
  return buildAvailabilityConfigFixture().config as AvailabilityConfig;
}

/** F-one, but Dinner closes at 10:00 PM on Wednesday and Thursday (Tuesday closes at 11:00 PM). */
function shortMidweekConfig(): AvailabilityConfig {
  const base = fOneConfig();
  return {
    ...base,
    scheduleServices: base.scheduleServices.map((row) =>
      row.venueServiceId === "vs-dinner"
        ? {
            ...row,
            dayHours: {
              version: 1,
              sets: [
                {
                  weekdays: [3, 4],
                  opensAt: row.opensAt,
                  lastSeatingAt: 1260,
                  closesAt: 1320,
                  seating: row.seating,
                  bookingTypes: row.bookingTypes,
                },
              ],
            },
          }
        : row
    ),
  };
}

const notifications = (page: Page) => page.getByRole("region", { name: "Notifications" });
const holidays = (page: Page) => page.getByRole("region", { name: "Upcoming holidays" });
const choices = (page: Page, name: string) => holidays(page).getByRole("group", { name });
/** The holidays start as one line under the venue's own dates; this opens them in place. */
const planHolidays = (page: Page) =>
  page.getByRole("button", { name: /^(Plan|View) holidays$/ }).click();
const specialDates = (page: Page) => page.getByRole("radio", { name: "Special dates" });

/**
 * Pins the browser clock to `now` and re-dates the stored sign-in around it. In CI the session is a
 * real Auth0 token that lapses within hours of the real date, so a clock set weeks ahead would sign
 * the Manager out (the landing page). Same approach as `visual.spec.ts`.
 */
async function pinClock(page: Page, now: Date): Promise<void> {
  await page.clock.setFixedTime(now);
  await page.addInitScript(
    (iat) => {
      const exp = iat + 3600;
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith("oidc.user:")) continue;
        const user = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
        const profile = { ...(user.profile as object), iat, exp };
        localStorage.setItem(key, JSON.stringify({ ...user, expires_at: exp, profile }));
      }
    },
    Math.floor(now.getTime() / 1000)
  );
}

/**
 * A second Manager: a context of its own, on the same venue. The clock is pinned before the app's
 * first load: a real Auth0 token has lapsed by a clock set weeks ahead, so an app that had already
 * booted on the real clock would read its session as long expired when the clock jumped, and clear
 * it (the landing page, "Sign In") before the page this returns is opened.
 */
async function newManager(
  browser: Browser,
  store: SharedConfigStore,
  now: Date
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: "e2e/.auth/user.json" });
  const page = await context.newPage();
  await mockApi(page);
  await pinClock(page, now);
  await page.goto("");
  await serveSharedConfig(page, store);
  return { context, page };
}

test.describe("Holiday decisions", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await pinClock(mockedPage, NOON);
  });

  test("H1: close Thanksgiving, Christmas Day and New Year's Day after one confirmation (budget 4)", async ({
    mockedPage: page,
  }) => {
    const store = createSharedConfig(fOneConfig());
    await serveSharedConfig(page, store);
    await firstPaint(page);
    const counter = countInteractions(page);

    await specialDates(counter.page).click({ force: true });
    await planHolidays(counter.page);
    await expect(
      holidays(page).getByText(
        /Restaurants usually close Thanksgiving, Christmas Day,? and New Year’s Day\./
      )
    ).toBeVisible();
    await holidays(counter.page).getByRole("button", { name: "Close these 3" }).click();
    // Closing three dates asks first, naming them; nothing is written before it is confirmed.
    const confirm = counter.page.getByRole("dialog", { name: "Close these 3 dates?" });
    await expect(confirm).toContainText("Thanksgiving, Thu, Nov 26");
    expect(store.batches).toHaveLength(0);
    await confirm.getByRole("button", { name: "Close 3 dates" }).click();

    await expect.poll(() => store.batches.length).toBe(1);
    const rules = store.batches[0]!.items.map((item) => item.rule);
    expect(rules.map((r) => r.startsOn).sort()).toEqual(["2026-11-26", "2026-12-25", "2027-01-01"]);
    for (const rule of rules) {
      expect(rule).toMatchObject({ kind: "closure", targetKind: "venue" });
      expect(rule.endsOn).toBe(rule.startsOn);
    }
    await expect(
      notifications(page).getByText(/^Closed on Thanksgiving, Christmas Day,? and New Year’s Day$/)
    ).toBeVisible();
    // The three are decided now, and no venue decision was written for them.
    await expect(holidays(page).getByRole("button", { name: "Decided (3)" })).toBeVisible();
    await expect(holidays(page).getByRole("button", { name: "Close these 3" })).toHaveCount(0);
    expect(store.decisionCalls).toEqual([]);
    record("H1", counter.count(), 4, BEFORE.H1);
  });

  test("H2: Christmas Eve open as usual, seen by a second Manager with 0 interactions (budget 3)", async ({
    mockedPage: page,
    browser,
  }) => {
    const store = createSharedConfig(fOneConfig());
    await serveSharedConfig(page, store);
    await firstPaint(page);
    const counter = countInteractions(page);

    await specialDates(counter.page).click({ force: true });
    await planHolidays(counter.page);
    await choices(counter.page, "Christmas Eve, Thu, Dec 24")
      .getByRole("button", { name: "Open as usual" })
      .click();
    await expect.poll(() => store.decisions.has("2026-12-24")).toBe(true);
    expect(store.decisionCalls).toEqual([
      { method: "PUT", date: "2026-12-24", body: { decision: "open_as_usual" } },
    ]);
    await expect(notifications(page).getByText("Christmas Eve: open as usual")).toBeVisible();
    record("H2 first Manager", counter.count(), 3, BEFORE.H2);

    // The second Manager, on another browser, loads Special dates and decides nothing.
    const other = await newManager(browser, store, NOON);
    try {
      await other.page.goto("availability?tab=special");
      await expect(other.page.getByRole("region", { name: "Upcoming holidays" })).toBeVisible();
      const second = countInteractions(other.page);
      // The collapsed line already leaves Christmas Eve out: 13 US holidays from Nov 8, 12 left.
      await expect(holidays(second.page).getByText("12 holidays not planned")).toBeVisible();
      record("H2 second Manager (the count on the line)", second.count(), 0);
      // Seeing the decision itself, under Decided, costs one press (Plan holidays).
      await planHolidays(other.page);
      await expect(holidays(other.page).getByRole("button", { name: "Decided (1)" })).toBeVisible();
      // Christmas Eve is not asked about again: no choices for it, among the undecided.
      await expect(choices(other.page, "Christmas Eve, Thu, Dec 24")).toHaveCount(0);
      await expect(choices(other.page, "Thanksgiving, Thu, Nov 26")).toBeVisible();
      // Looking at the Decided group is reading, not deciding.
      await other.page.getByRole("button", { name: "Decided (1)" }).click();
      const line = other.page.getByRole("listitem").filter({ hasText: "Christmas Eve" });
      await expect(line).toContainText("Open as usual");
      expect(store.decisionCalls).toHaveLength(1);
    } finally {
      await other.page.unrouteAll({ behavior: "ignoreErrors" });
      await other.context.close();
    }
  });

  test("H2: the calendar nudge does not ask a second Manager about a decided holiday", async ({
    mockedPage: page,
    browser,
  }) => {
    await pinClock(page, DEC_FIRST);
    const store = createSharedConfig(fOneConfig());
    await serveSharedConfig(page, store);
    const nudge = (p: Page) => p.getByText("Christmas Eve is Thu, Dec 24 and isn't planned yet.");

    // Before: Christmas Eve is the next holiday within a month, so the calendar says so.
    await page.goto("availability?tab=calendar");
    await expect(nudge(page)).toBeVisible();

    const other = await newManager(browser, store, DEC_FIRST);
    try {
      await other.page.goto("availability?tab=special");
      await planHolidays(other.page);
      await choices(other.page, "Christmas Eve, Thu, Dec 24")
        .getByRole("button", { name: "Open as usual" })
        .click();
      await expect.poll(() => store.decisions.has("2026-12-24")).toBe(true);

      await page.reload();
      await expect(page.getByRole("grid")).toBeVisible();
      await expect(nudge(page)).toHaveCount(0);
      // It moves on to the next holiday nothing has decided.
      await expect(
        page.getByText("Christmas Day is Fri, Dec 25 and isn't planned yet.")
      ).toBeVisible();
    } finally {
      await other.page.unrouteAll({ behavior: "ignoreErrors" });
      await other.context.close();
    }
  });

  test("H3: Special hours… on New Year's Eve opens the sheet on that date (budget before)", async ({
    mockedPage: page,
  }) => {
    const store = createSharedConfig(fOneConfig());
    await serveSharedConfig(page, store);
    await firstPaint(page);
    const counter = countInteractions(page);

    await specialDates(counter.page).click({ force: true });
    await planHolidays(counter.page);
    await choices(counter.page, "New Year’s Eve, Thu, Dec 31")
      .getByRole("button", { name: "Special hours…" })
      .click();
    const sheet = counter.page.getByRole("dialog", { name: "Add special dates" });
    await expect(sheet.getByRole("combobox", { name: "Date" })).toHaveValue("Dec 31, 2026");
    await expect(sheet.getByRole("radio", { name: "Special hours" })).toBeChecked();
    // A later Dinner close, as the walkthrough has it.
    await sheet
      .getByRole("group", { name: "Dinner" })
      .getByRole("combobox", { name: "Closes" })
      .click();
    await counter.page
      .getByRole("listbox", { name: "Closes" })
      .getByRole("option", { name: "1:00 AM", exact: true })
      .click();
    await sheet.getByTestId("add-dates-primary").click();

    await expect.poll(() => store.configPuts.length + store.batches.length).toBeGreaterThan(0);
    const rules = store.config.dateRules.filter((r) => r.startsOn === "2026-12-31");
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ kind: "special_hours", endsOn: "2026-12-31" });
    expect(rules[0]!.repeat ?? null).toBeNull();
    record("H3", counter.count(), BEFORE.H3 + 1, BEFORE.H3);
  });

  test("Decided → Change → Closed replaces the open mark: the closure first, then the mark is cleared", async ({
    mockedPage: page,
  }) => {
    const store = createSharedConfig(fOneConfig());
    store.decisions.set("2026-12-24", "2026-11-01T12:00:00.000Z");
    await serveSharedConfig(page, store);
    await page.goto("availability?tab=special");
    await expect(holidays(page)).toBeVisible();
    const counter = countInteractions(page);

    await planHolidays(counter.page);
    await holidays(counter.page).getByRole("button", { name: "Decided (1)" }).click();
    await holidays(counter.page)
      .getByRole("button", { name: "Change Christmas Eve, Thu, Dec 24" })
      .click();
    const group = choices(counter.page, "Christmas Eve, Thu, Dec 24");
    await expect(group.getByRole("button", { name: "Open as usual" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await group.getByRole("button", { name: "Closed" }).click();
    // Replacing a decision asks first: the toast cannot offer Undo for a two-save change.
    await counter.page
      .getByRole("dialog", { name: "Close Christmas Eve?" })
      .getByRole("button", { name: "Close Christmas Eve" })
      .click();

    await expect.poll(() => store.batches.length).toBe(1);
    expect(store.batches[0]!.items.map((i) => i.rule.startsOn)).toEqual(["2026-12-24"]);
    await expect
      .poll(() => store.decisionCalls)
      .toEqual([{ method: "DELETE", date: "2026-12-24", body: null }]);
    expect(store.decisions.has("2026-12-24")).toBe(false);
    await expect(
      notifications(page).getByText(/^Closed on Christmas Eve, Thu, Dec 24$/)
    ).toBeVisible();
    // It is still decided, now as a closure.
    await expect(holidays(page).getByRole("button", { name: "Decided (1)" })).toBeVisible();
    record("Decided → Closed", counter.count(), 5);
  });

  test("a rejected decision says Couldn't save with Retry, and the line stays undecided", async ({
    mockedPage: page,
  }) => {
    const store = createSharedConfig(fOneConfig());
    store.failDecisionPuts = 1;
    await serveSharedConfig(page, store);
    await page.goto("availability?tab=special");
    await expect(holidays(page)).toBeVisible();
    await planHolidays(page);

    const group = choices(page, "Christmas Eve, Thu, Dec 24");
    await group.getByRole("button", { name: "Open as usual" }).click();
    const line = page.getByRole("listitem").filter({ hasText: "Christmas Eve" });
    await expect(line.getByText("Couldn't save.")).toBeVisible();
    const retry = line.getByRole("button", { name: "Retry Christmas Eve, Thu, Dec 24" });
    await expect(retry).toBeFocused();
    expect(store.decisions.size).toBe(0);
    await expect(holidays(page).getByRole("button", { name: /^Decided/ })).toHaveCount(0);

    await retry.click();
    await expect.poll(() => store.decisions.has("2026-12-24")).toBe(true);
    await expect(holidays(page).getByRole("button", { name: "Decided (1)" })).toBeVisible();
    expect(store.decisionCalls.map((c) => c.method)).toEqual(["PUT", "PUT"]);
  });

  test("a Host reads the decisions and has nothing to decide", async ({ mockedPage: page }) => {
    const store = createSharedConfig(fOneConfig());
    store.decisions.set("2026-12-24", "2026-11-01T12:00:00.000Z");
    await serveSharedConfig(page, store);
    await page.route(/\/api\/v1\/venues\/[^/?]+\/team$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ...buildVenueTeamFixture(), viewerRole: "host" } }),
      })
    );
    await page.goto("availability?tab=special");
    await expect(holidays(page)).toBeVisible();
    // A Host is offered no planning: the line says View holidays.
    await expect(page.getByRole("button", { name: "View holidays" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Plan holidays" })).toHaveCount(0);
    await planHolidays(page);

    await expect(holidays(page).getByText("Not decided").first()).toBeVisible();
    for (const name of ["Closed", "Open as usual", "Special hours…", "Close these 3"]) {
      await expect(holidays(page).getByRole("button", { name })).toHaveCount(0);
    }
    await holidays(page).getByRole("button", { name: "Decided (1)" }).click();
    const line = page.getByRole("listitem").filter({ hasText: "Christmas Eve" });
    await expect(line).toContainText("Open as usual");
    await expect(line.getByRole("button")).toHaveCount(0);
    expect(store.decisionCalls).toEqual([]);
  });
});

test.describe("Special dates lists the venue's own dates first (#8692)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ mockedPage }) => {
    await pinClock(mockedPage, NOON);
  });

  test("the first row is the venue's next date, the holidays are one line below it, and first paint has at most 15 controls", async ({
    mockedPage: page,
  }) => {
    const config = fOneConfig();
    const store = createSharedConfig({
      ...config,
      dateRules: [
        ...config.dateRules,
        {
          id: "closed-dec-24",
          kind: "closure",
          targetKind: "venue",
          startsOn: "2026-12-24",
          endsOn: "2026-12-24",
        },
      ],
    });
    await serveSharedConfig(page, store);
    await page.goto("availability?tab=special");

    const rows = page.getByRole("list", { name: "Your special dates" }).getByRole("listitem");
    await expect(rows.first()).toContainText("Thu, Dec 24");
    await expect(holidays(page).getByText("12 holidays not planned")).toBeVisible();
    // The holiday line comes after the venue's own list.
    const row = await rows.first().boundingBox();
    const line = await holidays(page).boundingBox();
    expect(row!.y).toBeLessThan(line!.y);

    const controls = page
      .getByRole("main")
      .locator(
        ':is(button, a[href], input, select, [role="radio"], [role="menuitem"]):visible:enabled'
      );

    expect(await controls.count()).toBeLessThanOrEqual(15);
  });
});

test.describe("Copy to other days", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await pinClock(mockedPage, NOON);
  });

  /** Tuesday, Nov 10 on the Calendar layer: the day drawer's Copy hours… */
  async function openCopy(counter: InteractionCounter) {
    await counter.page.getByRole("radio", { name: "Calendar" }).click({ force: true });
    await counter.page.locator('[data-date="2026-11-10"]').first().click();
    await counter.page.getByRole("button", { name: "Copy hours…" }).click();
    return counter.page.getByRole("dialog", { name: "Copy Tuesday, Nov 10 to other days" });
  }

  const day = (dialog: Locator, name: string) => dialog.getByText(name, { exact: true });

  test("K1: Tuesday's hours on Wed and Thu every week change the regular week, not special dates (budget 7)", async ({
    mockedPage: page,
  }) => {
    const store = createSharedConfig(shortMidweekConfig());
    await serveSharedConfig(page, store);
    await firstPaint(page);
    const counter = countInteractions(page);

    const dialog = await openCopy(counter);
    await day(dialog, "Wednesday").click();
    await day(dialog, "Thursday").click();
    await expect(
      dialog.getByText("Every week… changes your regular week from Nov 9.")
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Every week…" }).click();

    // The regular week opens with the copied hours already in, starting with this week.
    const drawer = counter.page.getByRole("dialog", { name: "Change regular week" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("combobox", { name: "Starting" })).toHaveValue("Nov 9, 2026");
    await drawer.getByRole("button", { name: /^Save hours from/ }).click();

    await expect.poll(() => store.configPuts.length).toBe(1);
    const { upsert } = store.configPuts[0]!.changes;
    // The regular week changed; no special-hours rule, repeating or not, was created.
    expect(upsert.dateRules ?? []).toEqual([]);
    expect(
      (upsert.scheduleServices ?? []).length + (upsert.assignments ?? []).length
    ).toBeGreaterThan(0);
    expect(store.config.dateRules.filter((r) => r.kind === "special_hours")).toEqual([]);
    // prd.md criterion 9 amends K1 from "before" (6) to 7: Every week… is one more choice.
    record("K1", counter.count(), 7, BEFORE.K1);
  });

  test("K2: just this week saves one-off special hours on those dates, no repeat (budget before)", async ({
    mockedPage: page,
  }) => {
    const store = createSharedConfig(shortMidweekConfig());
    await serveSharedConfig(page, store);
    await firstPaint(page);
    const counter = countInteractions(page);

    const dialog = await openCopy(counter);
    await day(dialog, "Wednesday").click();
    await day(dialog, "Thursday").click();
    await expect(
      dialog.getByText(
        /Wed and Thu will use Tuesday’s hours \(.*\) on Wed, Nov 11 and Thu, Nov 12\./
      )
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Copy to Wed and Thu" }).click();

    await expect.poll(() => store.configPuts.length).toBe(1);
    const rules = (store.configPuts[0]!.changes.upsert.dateRules ?? []).filter(
      (r) => r.kind === "special_hours"
    );
    expect(rules.map((r) => [r.startsOn, r.endsOn])).toEqual([
      ["2026-11-11", "2026-11-11"],
      ["2026-11-12", "2026-11-12"],
    ]);
    for (const rule of rules) expect(rule.repeat ?? null).toBeNull();
    await expect(
      notifications(page).getByText("Copied Tuesday’s hours to Wed, Nov 11 and Thu, Nov 12")
    ).toBeVisible();
    record("K2", counter.count(), BEFORE.K2, BEFORE.K2);
  });

  test("days that already have the hours are named, and when all do nothing is saved", async ({
    mockedPage: page,
  }) => {
    const store = createSharedConfig(shortMidweekConfig());
    await serveSharedConfig(page, store);
    await firstPaint(page);
    const counter = countInteractions(page);

    const dialog = await openCopy(counter);
    // Fri already has Tuesday's hours; Wed does not.
    await day(dialog, "Wednesday").click();
    await day(dialog, "Friday").click();
    await expect(dialog.getByText("Fri already has these hours.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Copy to Wed", exact: true })).toBeEnabled();

    // Wed is off again: every target matches, and each button says why it is disabled.
    await day(dialog, "Wednesday").click();
    await expect(
      dialog.getByText("These days already have Tuesday’s hours.").first()
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Copy", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Every week…" })).toBeDisabled();
    // No day chosen: both say to choose one.
    await day(dialog, "Friday").click();
    await expect(dialog.getByText("Choose at least one day to copy to.").first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Copy", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Every week…" })).toBeDisabled();
    expect(store.configPuts).toEqual([]);
    await expect(page.getByRole("dialog", { name: "Change regular week" })).toHaveCount(0);
  });
});
