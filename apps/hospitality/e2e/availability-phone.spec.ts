import type { Locator, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
import { mockAvailability } from "./availability-draft-mock.js";

/**
 * #7980: Availability on a phone and from a keyboard. Layout only exists in a browser, so the
 * first screen, overflow, tap targets, drawers and focus are all measured here.
 *
 * The page scrolls inside `<main>`: `documentElement` stays at the viewport width whatever the
 * content does, so overflow is asserted on `<main>` and never on the document.
 */

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };
/** ux.md: 44 px touch targets. */
const TARGET = 44;

const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
const json = (data: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ data }),
});

const dinner = (id: string, scheduleId: string) => ({
  id,
  scheduleId,
  venueServiceId: "vs-dinner",
  opensAt: 1020,
  lastSeatingAt: 1260,
  closesAt: 1380,
  seating: { version: 1, interval: 15 },
  bookingTypes: ["online", "phone"],
});

/** Two schedules, so the Schedules tab shows; the second has a long name, as a real one might. */
async function mockTwoSchedules(page: Page) {
  await page.route(`${base}/availability/config`, (route) =>
    route.fulfill(
      json({
        config: {
          schedules: [
            { id: "regular", name: "Regular week", kind: "regular", isRegular: true },
            {
              id: "long",
              name: "Summer patio and rooftop season hours",
              kind: "alternate",
              isRegular: false,
            },
          ],
          venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
          scheduleServices: [dinner("ss-1", "regular"), dinner("ss-2", "long")],
          assignments: [
            { id: "as-1", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
          ],
          dateRules: [],
        },
        version: 7,
        source: "rows",
      })
    )
  );
}

async function open(page: Page, viewport = PHONE) {
  await page.setViewportSize(viewport);
  await page.goto("availability");
  await page.locator("[data-date]").first().waitFor();
}

/** A month ahead, so every row or cell in it is in the future whatever day the suite runs. */
async function openNextMonth(page: Page, viewport = PHONE) {
  await open(page, viewport);
  const period = page.locator("[aria-live='polite']").filter({ hasText: /\d{4}/ });
  const before = await period.textContent();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(period).not.toHaveText(before ?? "");
}

async function expectNoSideScroll(page: Page) {
  const { scroll, client } = await page.locator("main").evaluate((main) => ({
    scroll: main.scrollWidth,
    client: main.clientWidth,
  }));
  expect(scroll, "horizontal scroll inside <main>").toBeLessThanOrEqual(client);
}

async function moreMenu(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click();
  return page.getByRole("menu");
}

/** Every visible control under `scope` that is shorter or narrower than a finger. */
async function smallTargets(scope: Locator): Promise<string[]> {
  return scope.evaluate((root, target) => {
    const controls = root.querySelectorAll<HTMLElement>(
      'button, [role="radio"], [role="combobox"], select, input:not([type="checkbox"], [type="radio"])'
    );
    return (
      [...controls]
        // The breadcrumb is shared chrome, not this page's controls.
        .filter((control) => control.offsetParent !== null && !control.closest("nav"))
        .map((control) => ({ control, box: control.getBoundingClientRect() }))
        .filter(({ box }) => box.height < target || box.width < target)
        .map(({ control, box }) => {
          const name = control.getAttribute("aria-label") ?? control.textContent ?? control.tagName;
          return `${name.slice(0, 30)} ${Math.round(box.width)}x${Math.round(box.height)}`;
        })
    );
  }, TARGET);
}

async function setLocale(page: Page, locale: string) {
  await page.evaluate((tag) => localStorage.setItem("mbe-hospitality-locale", tag), locale);
}

test.describe("the first screen", () => {
  test("a phone shows several days before anything is scrolled", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await open(page);
    const first = await page.locator("[data-date]").first().boundingBox();
    // The toolbar used to end at 640 of 812. Room for at least five rows now, not one and a bit.
    expect(first!.y).toBeLessThan(480);
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Month" })).toBeVisible();
  });

  test("a phone keeps secondary actions in one menu, and each one works", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await open(page);
    for (const name of [
      "History",
      "Select…",
      /^Close…/,
      "Pause online booking",
      "Change regular week…",
      "Create another schedule…",
    ]) {
      await expect(page.getByRole("main").getByRole("button", { name })).toHaveCount(0);
    }
    const menu = await moreMenu(page);
    for (const name of [
      "History",
      "Select days",
      /^Close…/,
      "Pause online booking",
      "Change regular week…",
      "Create another schedule…",
    ]) {
      await expect(menu.getByRole("menuitem", { name })).toBeVisible();
    }
    await menu.getByRole("menuitem", { name: /^Close…/ }).click();
    await expect(page.getByRole("dialog", { name: "Close", exact: true })).toBeVisible();
  });

  test("a desktop keeps its controls on two rows, with date navigation on one line", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await open(page, DESKTOP);
    const first = await page.locator("[data-date]").first().boundingBox();
    // The toolbar used to push the first day to 472.
    expect(first!.y).toBeLessThan(430);
    const today = await page.getByRole("button", { name: "Today" }).boundingBox();
    const month = await page.getByRole("radio", { name: "Month" }).boundingBox();
    const close = await page.getByRole("button", { name: /^Close…/ }).boundingBox();
    expect(Math.abs(today!.y + today!.height / 2 - (month!.y + month!.height / 2))).toBeLessThan(4);
    expect(Math.abs(today!.y + today!.height / 2 - (close!.y + close!.height / 2))).toBeLessThan(4);
  });

  test("Create another schedule… looks like something to press", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await open(page, DESKTOP);
    const border = await page
      .getByRole("button", { name: "Create another schedule…" })
      .evaluate((button) => getComputedStyle(button).borderTopWidth);
    expect(parseFloat(border)).toBeGreaterThan(0);
  });
});

test.describe("375 px: nothing scrolls sideways", () => {
  for (const locale of ["en-US", "es-MX", "fr-CA"]) {
    test(`the three tabs in ${locale}`, async ({ mockedPage: page }) => {
      await mockAvailability(page);
      await mockTwoSchedules(page);
      await setLocale(page, locale);
      await open(page);
      await expectNoSideScroll(page);
      const tabs = page.getByRole("radiogroup").first().getByRole("radio");
      await tabs.nth(1).click({ force: true });
      await page.getByRole("combobox").first().waitFor();
      await expectNoSideScroll(page);
      await tabs.nth(2).click({ force: true });
      await expect(tabs.nth(2)).toHaveAttribute("aria-checked", "true");
      await page.getByRole("list").first().waitFor();
      await expectNoSideScroll(page);
    });
  }

  test("every Special dates filter can be reached, Past included", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await open(page);
    await page.getByRole("radio", { name: "Special dates" }).click({ force: true });
    const filter = page.getByRole("combobox", { name: "Filter special dates" });
    await filter.click();
    await page.getByRole("option", { name: "Past" }).click();
    await expect(filter).toHaveText(/Past/);
    await expectNoSideScroll(page);
  });

  test("the selection bar wraps", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await open(page);
    await page
      .locator("[data-date]")
      .nth(1)
      .click({ modifiers: ["ControlOrMeta"] });
    const bar = page.getByRole("group", { name: "Selected dates" });
    await expect(bar).toBeVisible();
    await expectNoSideScroll(page);
    const box = await bar.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
    const clear = await page.getByRole("button", { name: "Clear selection" }).boundingBox();
    expect(clear!.x + clear!.width).toBeLessThanOrEqual(PHONE.width);
  });

  test("History and the schedule drawers take the whole screen", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await page.route(`${base}/availability/changes*`, (route) =>
      route.fulfill(json({ items: [], total: 0 }))
    );
    await open(page);
    for (const item of ["History", "Change regular week…"]) {
      await (await moreMenu(page)).getByRole("menuitem", { name: item }).click();
      const drawer = page.getByRole("dialog").first();
      await expect(drawer).toBeVisible();
      await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0);
      expect((await drawer.boundingBox())!.width).toBe(PHONE.width);
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
    }
  });

  test("the call list fits, with every guest's phone on screen", async ({ mockedPage: page }) => {
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
      route.fulfill(
        json([
          {
            ruleId: "xmas",
            total: 2,
            cancelled: 2,
            sent: 1,
            rebooked: 0,
            unreachable: 1,
            refundFailed: 0,
            refundFailures: [],
            refundPending: 0,
          },
        ])
      )
    );
    await page.route(`${base}/closures/xmas/call-list`, (route) =>
      route.fulfill(
        json([
          {
            outcomeId: "o-1",
            reservationId: "r-1",
            guestName: "Maximiliana Rivera-Santos",
            partySize: 12,
            startTime: "2031-12-25T01:30:00.000Z",
            guestPhone: "+1 (555) 555-0100",
          },
        ])
      )
    );
    await open(page);
    await page.getByRole("radio", { name: "Special dates" }).click({ force: true });
    await page.getByRole("button", { name: /^Call list for/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("+1 (555) 555-0100")).toBeVisible();
    const fits = await dialog.evaluate((panel) => {
      const parts = [panel, ...panel.querySelectorAll("div")];
      return parts.every((part) => part.scrollWidth <= part.clientWidth);
    });
    expect(fits).toBe(true);
    const phone = await dialog.getByText("+1 (555) 555-0100").boundingBox();
    expect(phone!.x + phone!.width).toBeLessThanOrEqual(PHONE.width);
  });
});

test.describe("tap targets", () => {
  test("every control on the calendar is at least 44 px on a phone", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await open(page);
    expect(await smallTargets(page.locator("main"))).toEqual([]);
  });

  test("every control on Special dates is at least 44 px on a phone", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await open(page);
    await page.getByRole("radio", { name: "Special dates" }).click({ force: true });
    await page.getByRole("combobox", { name: "Filter special dates" }).waitFor();
    expect(await smallTargets(page.locator("main"))).toEqual([]);
  });

  test("a dialog's close, Cancel and Next are at least 44 px on a phone", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await open(page);
    await (await moreMenu(page)).getByRole("menuitem", { name: /^Close…/ }).click();
    const dialog = page.getByRole("dialog", { name: "Close", exact: true });
    await dialog.getByText("Step 1 of 2").waitFor();
    // A dialog opens at 0.97 scale: measure it once it has settled.
    await expect.poll(() => smallTargets(dialog)).toEqual([]);
  });

  test("a drawer's close and Save are at least 44 px on a phone", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await openNextMonth(page);
    await page.locator("[data-date]").nth(2).click();
    const drawer = page.getByRole("dialog").first();
    await drawer.getByRole("button", { name: "Edit Dinner" }).click();
    await drawer.getByRole("button", { name: "Remove Dinner" }).waitFor();
    await expect.poll(() => smallTargets(drawer)).toEqual([]);
  });

  test("a desktop keeps its density", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await open(page, DESKTOP);
    const today = await page.getByRole("button", { name: "Today" }).boundingBox();
    expect(today!.height).toBeLessThan(TARGET);
    const month = await page.getByRole("radio", { name: "Month" }).boundingBox();
    expect(month!.height).toBeLessThan(TARGET);
  });
});

test.describe("keyboard and focus", () => {
  test("a weekday column can be selected from the keyboard", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await open(page, DESKTOP);
    const header = page.getByRole("button", { name: "Select every Monday" });
    await page.getByRole("button", { name: "Select…" }).focus();
    for (let i = 0; i < 12; i += 1) {
      if (await header.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(header).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "Select every Tuesday" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("group", { name: "Selected dates" })).toBeVisible();
  });

  test("Space picks an agenda row, and Enter still opens it", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await openNextMonth(page);
    const row = page.locator("[data-date]").nth(1);
    await row.focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Selected dates" })).toBeVisible();
    await page.getByRole("button", { name: "Clear selection" }).click();
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").first()).toBeVisible();
  });

  test("Select days lets a phone pick without a long press", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await openNextMonth(page);
    await (await moreMenu(page)).getByRole("menuitem", { name: "Select days" }).click();
    await expect(page.getByText("Tap the days you want")).toBeVisible();
    await page.locator("[data-date]").nth(1).click();
    await page.locator("[data-date]").nth(2).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("2 dates selected")).toBeVisible();
    await page.getByRole("button", { name: "Clear selection" }).click();
    await page.locator("[data-date]").nth(1).click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
  });

  test("Edit moves focus to the row it opened", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await openNextMonth(page);
    await page.locator("[data-date]").nth(2).click();
    const drawer = page.getByRole("dialog").first();
    await drawer.getByRole("button", { name: "Edit Dinner" }).click();
    await expect(drawer.locator("fieldset input").first()).toBeFocused();
  });

  test("Closing a menu-opened drawer returns focus to More actions", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await page.route(`${base}/availability/changes*`, (route) =>
      route.fulfill(json({ items: [], total: 0 }))
    );
    await open(page);
    await (await moreMenu(page)).getByRole("menuitem", { name: "History" }).click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();
    // The menu's own focus restore must not pull focus back out of what it opened.
    await expect
      .poll(() => drawer.evaluate((panel) => panel.contains(document.activeElement)))
      .toBe(true);
    await page.waitForTimeout(100);
    expect(await drawer.evaluate((panel) => panel.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More actions" })).toBeFocused();
  });

  test("a bulk hours save clears the selection and puts focus on a day", async ({
    mockedPage: page,
  }) => {
    const mock = await mockAvailability(page);
    await openNextMonth(page, DESKTOP);
    const days = page.locator("[data-date]");
    await days.nth(10).click({ modifiers: ["ControlOrMeta"] });
    await days.nth(11).click({ modifiers: ["ControlOrMeta"] });
    await page.getByRole("button", { name: "Edit hours" }).click();
    const drawer = page.getByRole("dialog").first();
    await drawer.getByRole("button", { name: "Edit Dinner" }).click();
    await drawer.getByRole("button", { name: "Remove Dinner" }).click();
    await drawer.getByRole("button", { name: /^Save/ }).click();
    await expect(drawer).toHaveCount(0);
    expect(mock.puts.at(-1)?.status).toBe(200);
    await expect(page.getByRole("group", { name: "Selected dates" })).toHaveCount(0);
    await expect(days.nth(10)).toBeFocused();
  });

  test("the first quick setup save hands focus to the calendar", async ({ mockedPage: page }) => {
    const empty = {
      schedules: [],
      venueServices: [],
      scheduleServices: [],
      assignments: [],
      dateRules: [],
    };
    let saved = false;
    await mockAvailability(page);
    await page.route(`${base}/availability/config`, (route) => {
      if (route.request().method() === "PUT") {
        saved = true;
        return route.fulfill(json({ version: 4, changeId: "chg-1" }));
      }
      return route.fulfill(
        json(
          saved
            ? {
                config: {
                  ...empty,
                  schedules: [
                    { id: "regular", name: "Regular week", kind: "regular", isRegular: true },
                  ],
                  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
                  scheduleServices: [dinner("ss-1", "regular")],
                },
                version: 4,
                source: "rows",
              }
            : { config: empty, version: 3, source: "empty" }
        )
      );
    });
    await page.setViewportSize(DESKTOP);
    await page.goto("availability");
    await page.getByRole("button", { name: "Dinner" }).click();
    await page.getByRole("button", { name: "Weekdays" }).click();
    const save = page.getByRole("button", { name: "Save and open bookings" });
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(page.locator('[data-date][tabindex="0"]')).toBeFocused();
  });
});

test.describe("axe and small print", () => {
  const AXE_RULES = ["label-content-name-mismatch", "heading-order"];

  test("agenda rows say what they show", async ({ mockedPage: page }) => {
    await mockAvailability(page, { weekdays: [1, 2, 3, 4, 5, 6] });
    await open(page);
    const results = await new AxeBuilder({ page }).include("main").withRules(AXE_RULES).analyze();
    expect(results.violations).toEqual([]);
  });

  test("calendar cells say what they show", async ({ mockedPage: page }) => {
    await mockAvailability(page, { weekdays: [1, 2, 3, 4, 5, 6] });
    await open(page, DESKTOP);
    const results = await new AxeBuilder({ page }).include("main").withRules(AXE_RULES).analyze();
    expect(results.violations).toEqual([]);
  });

  test("quick setup's headings stay in order", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await page.route(`${base}/availability/config`, (route) =>
      route.fulfill(
        json({
          config: {
            schedules: [],
            venueServices: [],
            scheduleServices: [],
            assignments: [],
            dateRules: [],
          },
          version: 3,
          source: "empty",
        })
      )
    );
    await page.setViewportSize(PHONE);
    await page.goto("availability");
    await page.getByRole("button", { name: "Save and open bookings" }).waitFor();
    const results = await new AxeBuilder({ page }).include("main").withRules(AXE_RULES).analyze();
    expect(results.violations).toEqual([]);
  });

  test("a schedule's actions do not repeat its name on screen", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await mockTwoSchedules(page);
    await open(page);
    await page.getByRole("radio", { name: "Schedules" }).click({ force: true });
    const edit = page.getByRole("button", { name: "Edit Summer patio and rooftop season hours" });
    await expect(edit).toHaveText("Edit");
    await expectNoSideScroll(page);
  });

  test("the sidebar button no longer floats over the list", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await open(page);
    const toggle = await page.getByRole("button", { name: /sidebar/i }).boundingBox();
    const rows = await page.locator("[data-date]").evaluateAll((all) =>
      all.map((row) => {
        const { x, y, width, height } = row.getBoundingClientRect();
        return { x, y, width, height };
      })
    );
    const overlapping = rows.filter(
      (row) =>
        row.x < toggle!.x + toggle!.width &&
        toggle!.x < row.x + row.width &&
        row.y < toggle!.y + toggle!.height &&
        toggle!.y < row.y + row.height
    );
    expect(overlapping).toEqual([]);
    expect(toggle!.height).toBeGreaterThanOrEqual(TARGET);
  });

  test("fr-CA: what the server names in en-US reads in French", async ({ mockedPage: page }) => {
    await mockAvailability(page, { weekdays: [1, 2, 3, 4, 5, 6] });
    await setLocale(page, "fr-CA");
    await open(page);
    const main = page.locator("main");
    await expect(main).not.toContainText("Regular week");
    await expect(main).not.toContainText("Closed");
    await expect(main).toContainText("Semaine habituelle");
    await expect(main).toContainText("Fermé");
  });
});
