import type { Locator, Page } from "@playwright/test";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { test, expect } from "./fixtures.js";
import { buildAvailabilityConfigFixture, buildVenueTeamFixture, loadFixture } from "./api-mocks.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { weekPanel } from "./helpers/first-paint.js";
import { countInteractions } from "./helpers/interaction-counter.js";
import { captureConfigPuts, firstPaint, mockNoopPreview } from "./helpers/scenario-fixtures.js";

/**
 * Availability on a phone, and what's on tonight (docs/features/availability-phone-tonight:
 * prd.md criteria 4-7, 10; ux.md F1, F2). Each walkthrough starts on `/availability` first paint,
 * counts Locator actions through `countInteractions`, and records its count as an annotation.
 * Counts are agent stand-in evidence, not a timed walkthrough.
 *
 * Today is pinned to Sun, Nov 8, 2026, 12:00 PM. F-one is the `mockedPage` venue (Lunch 11:30 AM /
 * 2:00 PM / 3:00 PM and Dinner 5:00 PM / 9:30 PM / 11:00 PM, every day).
 */

const TODAY = "2026-11-08";
const DESKTOP = { width: 1280, height: 720 } as const;
const PHONE = { width: 375, height: 812 } as const;
/** PRD 4 P2: half of the 2,472.7 px the week panel measured on the base at 375x812. */
const PANEL_HEIGHT_BUDGET = 1236;

function record(name: string, count: number, budget: number): void {
  test.info().annotations.push({
    type: "interactions (agent stand-in)",
    description: `${name}: ${count} of ${budget}`,
  });
  expect(count, `${name} interactions`).toBeLessThanOrEqual(budget);
}

/** Choosing a time is two interactions: open the list, pick the option. */
async function chooseTime(
  page: Page,
  scope: Locator,
  label: string,
  index: number,
  time: string
): Promise<void> {
  await scope.getByRole("combobox", { name: label }).nth(index).click();
  await page
    .getByRole("listbox", { name: label })
    .getByRole("option", { name: time, exact: true })
    .click();
}

/** The field a refused Save lands on: Dinner's Opens, the overlap with Lunch. */
const PROBLEM_FIELD = "Opens";

const savePanel = (page: Page) =>
  weekPanel(page).getByRole("button", { name: "Save", exact: true });

/** A service's line on a phone: its accessible name starts with the service's name. */
const line = (page: Page, name: string) =>
  weekPanel(page).getByRole("button", { name: new RegExp(`^${name} ?, `) });

// ── Today line mocks ────────────────────────────────────────────────────────────────────────────

type Closure = {
  readonly ruleId: string;
  readonly targetKind: "venue" | "service" | "booking" | "tables";
  readonly from: number;
  readonly to: number;
  readonly venueServiceId?: string;
  readonly bookingTypes?: readonly string[];
};

interface TodayScenario {
  /** Dates other than TODAY are the regular week. */
  readonly closures?: readonly Closure[];
  /** Services running today; default Lunch and Dinner. */
  readonly services?: readonly ("lunch" | "dinner")[];
  readonly closedDay?: boolean;
  readonly rules?: readonly DateRule[];
}

const SERVICE_ROWS = {
  lunch: {
    venueServiceId: "vs-lunch",
    name: "Lunch",
    opensAt: 690,
    lastSeatingAt: 840,
    closesAt: 900,
  },
  dinner: {
    venueServiceId: "vs-dinner",
    name: "Dinner",
    opensAt: 1020,
    lastSeatingAt: 1290,
    closesAt: 1380,
  },
} as const;

/** Serves F-one's config (plus `rules`) and a day list whose TODAY follows the scenario. */
async function mockToday(page: Page, scenario: TodayScenario = {}): Promise<void> {
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
  const fixture = buildAvailabilityConfigFixture();
  const config: AvailabilityConfig = {
    ...(fixture.config as AvailabilityConfig),
    // A closure band is read only with its rule in hand, so each band has a rule beside it.
    dateRules: [
      ...(scenario.rules ?? []),
      ...(scenario.closures ?? [])
        .filter((band) => !(scenario.rules ?? []).some((rule) => rule.id === band.ruleId))
        .map(
          (band) =>
            ({
              id: band.ruleId,
              kind: "closure",
              targetKind: band.targetKind,
              venueServiceId: band.venueServiceId ?? null,
              bookingTypes: band.bookingTypes ?? null,
              startsOn: TODAY,
              endsOn: TODAY,
            }) as DateRule
        ),
    ],
  };
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
  await page.route(`${base}/availability/config`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill(json({ config, version: fixture.version, source: "rows" }))
      : route.fallback()
  );
  await page.route(`${base}/availability/days*`, (route) => {
    const url = new URL(route.request().url());
    const days: unknown[] = [];
    for (
      let d = new Date(`${url.searchParams.get("from")}T00:00:00Z`);
      d <= new Date(`${url.searchParams.get("to")}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const serviceDate = d.toISOString().slice(0, 10);
      const special = serviceDate === TODAY;
      const names = special ? (scenario.services ?? ["lunch", "dinner"]) : ["lunch", "dinner"];
      const closed = special && scenario.closedDay === true;
      days.push({
        serviceDate,
        label: closed ? "Closed" : "Regular",
        scheduleId: closed ? null : "sch-regular",
        serviceCount: closed ? 0 : names.length,
        closures: special ? (scenario.closures ?? []) : [],
        bookingOpen: { online: true, phone: true, waitlist: true },
        services: closed ? [] : names.map((name) => SERVICE_ROWS[name as "lunch" | "dinner"]),
      });
    }
    return route.fulfill(json(days));
  });
}

const todayLine = (page: Page) => page.getByRole("region", { name: "Today" });
const items = (page: Page) => todayLine(page).getByRole("list", { name: "In force tonight" });

/** A tonight rule for TODAY, in the shape the Timeline writes. */
function tonightRule(
  id: string,
  targetKind: DateRule["targetKind"],
  payload: Extract<DateRule, { kind: "tonight" }>["payload"],
  extra: Partial<DateRule> = {}
): DateRule {
  return {
    id,
    kind: "tonight",
    targetKind,
    startsOn: TODAY,
    endsOn: TODAY,
    payload,
    ...extra,
  } as DateRule;
}

const WHOLE_DAY = { from: 0, to: 2880 } as const;

test.describe("Availability on a phone (P1, P2)", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await mockedPage.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
    await mockedPage.setViewportSize(PHONE);
  });

  test("P1: Dinner's close, one line open, in 4 interactions (budget 4)", async ({
    mockedPage: page,
  }) => {
    const puts = await captureConfigPuts(page);
    await mockNoopPreview(page);
    await firstPaint(page);

    // Before: every service is one line and none is open. Names carry hours and days.
    await expect(line(page, "Lunch")).toHaveAttribute("aria-expanded", "false");
    await expect(line(page, "Dinner")).toHaveAttribute("aria-expanded", "false");
    await expect(line(page, "Lunch")).toHaveAccessibleName(
      /^Lunch ?, 11:30 AM.*3:00 PM · Every day$/
    );
    await expect(line(page, "Dinner")).toHaveAccessibleName(
      /^Dinner ?, 5:00 PM.*11:00 PM · Every day$/
    );
    // Dinner's line is inside the first viewport.
    const box = await line(page, "Dinner").boundingBox();
    expect(box, "Dinner's line has a box").not.toBeNull();
    if (box === null) return;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);

    const counter = countInteractions(page);
    const panel = weekPanel(counter.page);
    await panel.getByRole("button", { name: /^Dinner ?, / }).click();
    await expect(line(page, "Dinner")).toHaveAttribute("aria-expanded", "true");
    // Dinner already closes at 11:00 PM on F-one, so the walkthrough moves it to 10:00 PM.
    await chooseTime(counter.page, panel, "Closes", 0, "10:00 PM");
    await savePanel(counter.page).click();

    await expect.poll(() => puts.bodies().length).toBe(1);
    const dinner = puts
      .last()
      .changes.upsert.scheduleServices?.find((row) => row.venueServiceId === "vs-dinner");
    expect(dinner?.closesAt).toBe(22 * 60);
    record("P1", counter.count(), 4);
  });

  test("after a Save that lands, every line closes", async ({ mockedPage: page }) => {
    await mockEmptyVenue(page, {
      derive: true,
      config: buildAvailabilityConfigFixture().config as AvailabilityConfig,
    });
    await mockNoopPreview(page);
    const puts = await captureConfigPuts(page);
    await firstPaint(page);
    await line(page, "Dinner").click();
    await chooseTime(page, weekPanel(page), "Closes", 0, "10:00 PM");
    await savePanel(page).click();
    await expect.poll(() => puts.bodies().length).toBe(1);
    await expect(line(page, "Dinner")).toHaveAttribute("aria-expanded", "false");
    await expect(weekPanel(page).locator('button[aria-expanded="true"]')).toHaveCount(0);
  });

  test("P2: the week panel, with no changes, is at most half its old height", async ({
    mockedPage: page,
  }) => {
    await firstPaint(page);
    await expect(line(page, "Dinner")).toBeVisible();
    const box = await weekPanel(page).boundingBox();
    expect(box, "the week panel has a box").not.toBeNull();
    if (box === null) return;
    test.info().annotations.push({
      type: "week panel height (px, 375x812)",
      description: `${box.height.toFixed(1)} of ${PANEL_HEIGHT_BUDGET} (base: 2472.7)`,
    });
    expect(box.height).toBeLessThanOrEqual(PANEL_HEIGHT_BUDGET);
  });

  test("opening a line closes the other, and a line's hours show beside its name", async ({
    mockedPage: page,
  }) => {
    await firstPaint(page);
    await line(page, "Lunch").click();
    await expect(line(page, "Lunch")).toHaveAttribute("aria-expanded", "true");
    await line(page, "Dinner").click();
    await expect(line(page, "Dinner")).toHaveAttribute("aria-expanded", "true");
    await expect(line(page, "Lunch")).toHaveAttribute("aria-expanded", "false");
    await line(page, "Dinner").click();
    await expect(line(page, "Dinner")).toHaveAttribute("aria-expanded", "false");
  });

  test("a problem stays open: its line cannot close, and a refused Save focuses its field", async ({
    mockedPage: page,
  }) => {
    await mockNoopPreview(page);
    await firstPaint(page);
    const panel = weekPanel(page);
    await line(page, "Dinner").click();
    // Dinner opening at 2:00 PM overlaps Lunch, which runs to 3:00 PM.
    await chooseTime(page, panel, "Opens", 0, "2:00 PM");
    await expect(panel.getByText(/overlaps/).first()).toBeVisible();

    // The line carrying the problem is open, and pressing it pins it open rather than closing it.
    const dinner = line(page, "Dinner");
    await expect(dinner).toHaveAttribute("aria-expanded", "true");
    await dinner.click();
    await expect(dinner).toHaveAttribute("aria-expanded", "true");

    // Save stays pressable, is announced as disabled, and focuses the first problem's field.
    const save = savePanel(page);
    await expect(save).toHaveAttribute("aria-disabled", "true");
    // aria-disabled, not disabled: a real tap lands, so the click is forced past Playwright's enabled check.
    await save.click({ force: true });
    await expect(panel.getByRole("combobox", { name: PROBLEM_FIELD }).first()).toBeFocused();
  });

  test("fixing a problem by typing inside its line keeps the line open and the field focused", async ({
    mockedPage: page,
  }) => {
    await firstPaint(page);
    const panel = weekPanel(page);
    await panel.getByRole("button", { name: "Add another service" }).click();
    // The new service has no name yet: a problem, so its line is open and its name is focused.
    const name = panel.getByRole("textbox", { name: "Service name" }).last();
    await expect(name).toBeFocused();
    await name.pressSequentially("Late supper");
    await expect(name).toBeFocused();
    await expect(name).toHaveValue("Late supper");
    await expect(panel.getByRole("button", { name: /^Late supper ?, / })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  test("Add another service opens the new service with its name focused", async ({
    mockedPage: page,
  }) => {
    await firstPaint(page);
    await weekPanel(page).getByRole("button", { name: "Add another service" }).click();
    await expect(
      weekPanel(page).getByRole("textbox", { name: "Service name" }).last()
    ).toBeFocused();
    await expect(line(page, "Lunch")).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("Availability on a desktop", () => {
  test("no service lines: the form is as before", async ({ mockedPage: page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
    await page.setViewportSize(DESKTOP);
    await firstPaint(page);
    const panel = weekPanel(page);
    await expect(panel.getByRole("textbox", { name: "Service name" })).toHaveCount(2);
    await expect(panel.getByRole("combobox", { name: "Closes" }).first()).toBeVisible();
    await expect(panel.locator('button[id$="-line-header"]')).toHaveCount(0);
  });
});

test.describe("The Today line (T1, T2)", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await mockedPage.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  });

  for (const [name, viewport] of [
    ["desktop", DESKTOP],
    ["phone", PHONE],
  ] as const) {
    test.describe(name, () => {
      test.beforeEach(async ({ mockedPage }) => {
        await mockedPage.setViewportSize(viewport);
      });

      test("T1: hours alone, and the link, in 0 interactions", async ({ mockedPage: page }) => {
        await mockToday(page);
        await firstPaint(page);
        const counter = countInteractions(page);
        const region = todayLine(counter.page);
        await expect(region).toBeVisible();
        await expect(region).toContainText("Sun, Nov 8");
        await expect(region).toContainText("Lunch 11:30 AM–3:00 PM");
        await expect(region).toContainText("Dinner 5:00 PM–11:00 PM");
        await expect(items(page)).toHaveCount(0);
        await expect(region.getByRole("link", { name: "Change tonight" })).toBeVisible();
        record("T1 hours", counter.count(), 0);
      });

      test("T1: a service closed, closing early, a night-of rule and a window", async ({
        mockedPage: page,
      }) => {
        await mockToday(page, {
          services: ["dinner"],
          closures: [
            // Lunch closed all day: the day no longer lists it.
            { ruleId: "c-lunch", targetKind: "service", venueServiceId: "vs-lunch", ...WHOLE_DAY },
            // The venue closing from 9:30 PM, and closed 3:00-4:00 PM... as separate bands.
            { ruleId: "c-early", targetKind: "venue", from: 21 * 60 + 30, to: 2880 },
            { ruleId: "c-gap", targetKind: "venue", from: 15 * 60, to: 16 * 60 },
          ],
          rules: [
            tonightRule(
              "t-blocked",
              "tables",
              { version: 1, stop: { ...WHOLE_DAY } },
              { tableIds: ["tbl-a", "tbl-b"] }
            ),
          ],
        });
        await firstPaint(page);
        const counter = countInteractions(page);
        const list = items(counter.page);
        await expect(list).toBeVisible();
        await expect(list.getByText("Lunch closed", { exact: true })).toBeVisible();
        await expect(list.getByText("Closing early · 9:30 PM", { exact: true })).toBeVisible();
        await expect(list.getByText("Closed 3:00 PM–4:00 PM", { exact: true })).toBeVisible();
        await expect(
          list.getByText("2 tables blocked · rest of tonight", { exact: true })
        ).toBeVisible();
        // The closed service is an item, not an hours entry.
        await expect(todayLine(page)).not.toContainText("Lunch 11:30");
        await expect(todayLine(page)).toContainText("Dinner 5:00 PM–11:00 PM");
        record("T1 items", counter.count(), 0);
      });

      test("T1: a night-of close early reads as the Timeline's chip", async ({
        mockedPage: page,
      }) => {
        await mockToday(page, {
          rules: [tonightRule("t-close", "venue", { version: 1, closeAt: 21 * 60 + 30 })],
        });
        await firstPaint(page);
        await expect(
          items(page).getByText("Closing early · 9:30 PM", { exact: true })
        ).toBeVisible();
      });

      test("T1: a closed day reads Closed, with no items", async ({ mockedPage: page }) => {
        await mockToday(page, {
          closedDay: true,
          closures: [{ ruleId: "c-all", targetKind: "venue", ...WHOLE_DAY }],
        });
        await firstPaint(page);
        await expect(todayLine(page)).toContainText("Closed");
        await expect(items(page)).toHaveCount(0);
      });

      test("said once: with the online-pause banner up, the line leaves online out", async ({
        mockedPage: page,
      }) => {
        const pause: DateRule = {
          id: "pause-online",
          kind: "closure",
          targetKind: "booking",
          bookingTypes: ["online"],
          startsOn: TODAY,
          endsOn: null,
        } as DateRule;
        await mockToday(page, {
          services: ["dinner"],
          closures: [
            { ruleId: "c-lunch", targetKind: "service", venueServiceId: "vs-lunch", ...WHOLE_DAY },
            {
              ruleId: "pause-online",
              targetKind: "booking",
              bookingTypes: ["online"],
              ...WHOLE_DAY,
            },
          ],
          rules: [pause, tonightRule("t-pause", "booking", { version: 1, stop: { ...WHOLE_DAY } })],
        });
        await firstPaint(page);
        await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
        const list = items(page);
        await expect(list.getByText("Lunch closed", { exact: true })).toBeVisible();
        await expect(list.getByText(/Online paused/)).toHaveCount(0);
        await expect(list.getByText(/Online and phone paused/)).toHaveCount(0);
      });

      test("a Host sees the same line and no editors", async ({ mockedPage: page }) => {
        await mockToday(page, {
          services: ["dinner"],
          closures: [
            { ruleId: "c-lunch", targetKind: "service", venueServiceId: "vs-lunch", ...WHOLE_DAY },
          ],
        });
        await page.route(/\/api\/v1\/venues\/[^/?]+\/team$/, (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: { ...buildVenueTeamFixture(), viewerRole: "host" } }),
          })
        );
        await page.goto("availability");
        const region = todayLine(page);
        await expect(region).toBeVisible();
        await expect(region).toContainText("Dinner 5:00 PM–11:00 PM");
        await expect(items(page).getByText("Lunch closed", { exact: true })).toBeVisible();
        await expect(region.getByRole("link", { name: "Change tonight" })).toBeVisible();
        await expect(page.getByTestId("week-panel")).toHaveCount(0);
        for (const buttonName of ["Close…", "Pause online booking", "Add a schedule…"]) {
          await expect(page.getByRole("button", { name: buttonName })).toHaveCount(0);
        }
        await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
      });

      test("T2: Change tonight opens the Timeline's Tonight panel (budget 2)", async ({
        mockedPage: page,
      }) => {
        await mockToday(page);
        await firstPaint(page);
        const counter = countInteractions(page);

        await counter.page.getByRole("link", { name: "Change tonight" }).click();
        await expect(page).toHaveURL(/\/timeline/);
        // The panel is open: its controls are on screen without another tap.
        await expect(page.getByRole("button", { name: "Emergency: close tonight…" })).toBeVisible();
        await expect(page).not.toHaveURL(/tonight=open/);
        record("T2", counter.count(), 2);

        // A reload of the Timeline keeps the panel closed; Back lands on /availability.
        await page.reload();
        await expect(page.getByRole("button", { name: /^Tonight\s*▾/ })).toBeVisible();
        await expect(page.getByRole("button", { name: "Emergency: close tonight…" })).toHaveCount(
          0
        );
        await page.goBack();
        await expect(page).toHaveURL(/\/availability/);
      });
    });
  }
});
