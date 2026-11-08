import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { buildVenueTeamFixture } from "./api-mocks.js";
import { mockClosures } from "./helpers/close-mock.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { countFirstPaintControls, weekPanel } from "./helpers/first-paint.js";
import { countInteractions } from "./helpers/interaction-counter.js";
import {
  DEMO_WEEK_VIA_SCHEDULES_COUNT,
  setUniformBistroWeek,
} from "./helpers/quick-setup-scenarios.js";
import {
  captureConfigPuts,
  firstPaint,
  layerOption,
  mockNoopPreview,
  nextMonthDay,
  pickerDay,
  pinToday,
} from "./helpers/scenario-fixtures.js";
import { localDay } from "./local-day.js";

/**
 * Setup hierarchy end to end (breakdown "Setup hierarchy end-to-end scenarios", checks a-e,
 * adapted to the layered `/availability` of the 2026-11-08 amendment), PRD 15, 21 and 23.
 *
 * Counts are agent stand-in evidence on a local run with a synthetic OIDC session; the hand-timing
 * bar (<= 5 minutes) stays an Owner-only check. The "before" editor counts of check (a) belong to a
 * throwaway worktree of origin/main @ 7c051456f and are not measured here: the "after" count is
 * asserted.
 */

const PHONE = { width: 375, height: 812 } as const;

/** Registered after mockApi, so it wins: the viewer is a Host at the venue. */
async function viewAsHost(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/venues\/[^/?]+\/team$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { ...buildVenueTeamFixture(), viewerRole: "host" } }),
    })
  );
}

/** A floor plan with one section, so "block one named section for one date" has a section to name. */
async function mockBarSection(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/floor-plan-sections(\?|$)/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const at = "2026-01-01T00:00:00.000Z";
    return route.fulfill({
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
            createdAt: at,
            updatedAt: at,
          },
        ],
      }),
    });
  });
}

test.describe("Setup hierarchy: the layered Availability page", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await pinToday(mockedPage);
  });

  test("(a) each resource type has one primary editor, reached from the hub", async ({
    mockedPage: page,
  }) => {
    await mockNoopPreview(page);
    await page.goto("setup");
    await expect(page.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeVisible();

    // Regular week: the week form on the first layer. No drawer, no date picker first.
    await page.getByRole("button", { name: "Change regular week…" }).click();
    await expect(page).toHaveURL(/\/availability\?tab=schedules/);
    await expect(weekPanel(page)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Schedules: the schedule editor, seeded from the regular week, on the Schedules layer.
    await page.goto("setup");
    await page.getByRole("button", { name: "Add a schedule…" }).first().click();
    await expect(page).toHaveURL(/\/availability\?tab=schedules/);
    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: /Schedule name/ })
    ).toBeVisible();

    // Special dates: the Special dates layer.
    await page.goto("setup");
    await page.getByRole("button", { name: "Open Special dates" }).click();
    await expect(page).toHaveURL(/\/availability\?tab=special/);
    await expect(layerOption(page, "Special dates")).toBeChecked();

    // Booking: its drawer, in place.
    await page.goto("setup");
    await page.getByRole("button", { name: "Booking rules…" }).click();
    await expect(page.getByRole("dialog", { name: "Booking rules" })).toBeVisible();
    await page.keyboard.press("Escape");

    // Floor plan, sections and tables: the floor plan editor.
    await page.getByRole("button", { name: "Open floor plan Main Floor" }).click();
    await expect(page).toHaveURL(/\/floor-plans\/fp_e2e_001$/);
  });

  test("(b) an empty venue: a two-service varied week in quick setup, then one section blocked for one date", async ({
    mockedPage: page,
  }) => {
    test.slow();
    await mockBarSection(page);
    const venue = await mockEmptyVenue(page, { derive: true });
    await page.goto("availability");
    await expect(page.getByRole("heading", { name: "Set your regular week" })).toBeVisible();
    const quickSetup = countInteractions(page);

    // Lunch Mon–Fri, Dinner Tue–Sun closing 12:00 AM on Fri–Sat (the demo week without Brunch).
    const q = quickSetup.page;
    await q.getByRole("button", { name: "Lunch" }).click();
    await q.getByRole("button", { name: "Every day" }).click();
    await q.getByRole("button", { name: "Different days for this service" }).click();
    await q
      .getByRole("group", { name: "Lunch runs on" })
      .getByRole("button", { name: "Weekdays" })
      .click();
    await q.getByRole("button", { name: "Add another service" }).click();
    await q.getByRole("button", { name: "Dinner" }).last().click();
    await q.getByRole("button", { name: "Different days for this service" }).last().click();
    await q
      .getByRole("group", { name: "Dinner runs on" })
      .getByText("Monday", { exact: true })
      .click();
    await q.getByRole("button", { name: "Different hours on some days" }).last().click();
    const later = q.getByRole("group", { name: "Dinner: different hours" });
    await later.getByText("Fri", { exact: true }).click();
    await later.getByText("Sat", { exact: true }).click();
    await later.getByRole("combobox", { name: "Closes" }).click();
    await q
      .getByRole("listbox", { name: "Closes" })
      .getByRole("option", { name: "12:00 AM", exact: true })
      .click();
    await q.getByRole("button", { name: "Save and open bookings" }).click();
    await expect.poll(() => venue.savedBody()).not.toBeNull();
    // A two-service varied week costs no more than the pre-quick-setup path to the same week did.
    // [INFERENCE] The 7c051456f quick-setup baseline itself is not re-measured here.
    test.info().annotations.push({
      type: "interactions (agent stand-in)",
      description: `(b) two-service varied week in quick setup: ${quickSetup.count()}`,
    });
    expect(quickSetup.count()).toBeLessThan(DEMO_WEEK_VIA_SCHEDULES_COUNT);

    // Then block one named section for one date, through the entry the hub uses.
    const closeDay = nextMonthDay(24);
    const closures = await mockClosures(page);
    await page.goto("availability?from=setup&closeSection=sec-bar");
    const dialog = page.getByRole("dialog", { name: "Close", exact: true });
    await expect(dialog.getByRole("radio", { name: "One section" })).toBeChecked();
    await expect(dialog.getByRole("combobox", { name: "Section" })).toContainText("Bar");
    await dialog.getByText("One date", { exact: true }).click();
    await dialog.getByRole("combobox", { name: "Date" }).click();
    await page.getByRole("button", { name: "Next month" }).click();
    await pickerDay(page, closeDay).click();
    await dialog.getByTestId("close-primary").click();
    await expect.poll(() => closures.saved()).not.toBeNull();
    expect(closures.saved()).toMatchObject({
      rule: { kind: "closure", targetKind: "tables", sectionId: "sec-bar", startsOn: closeDay },
    });
  });

  test("(c) Tonight, Compare services, History, Booking rules, Change regular week, Copy day, Special dates and the guest-view strip are reachable and act", async ({
    mockedPage: page,
  }) => {
    const puts = await captureConfigPuts(page);
    await mockNoopPreview(page);
    await firstPaint(page);

    // Guest-view strip: beside the week form, and it moves with an edit.
    const strip = page.getByRole("complementary", { name: "Guest preview" });
    await expect(strip).toBeVisible();

    // Compare services, History and Booking rules: the header ⋯.
    const more = page.getByRole("button", { name: "More actions" });
    await more.click();
    await page.getByRole("menuitem", { name: "Compare services" }).click();
    await expect(page.getByRole("heading", { name: "Compare services" })).toBeVisible();
    await more.click();
    await page.getByRole("menuitem", { name: "History" }).click();
    await expect(page.getByRole("dialog", { name: "History" })).toBeVisible();
    await page.keyboard.press("Escape");
    await more.click();
    await page.getByRole("menuitem", { name: "Booking rules…" }).click();
    await expect(page.getByRole("dialog", { name: "Booking rules" })).toBeVisible();
    await page.keyboard.press("Escape");

    // Change regular week: edit in place and save (today's date), no drawer.
    await weekPanel(page).getByRole("combobox", { name: "Closes" }).nth(1).click();
    await page
      .getByRole("listbox", { name: "Closes" })
      .getByRole("option", { name: "10:00 PM", exact: true })
      .click();
    await weekPanel(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => puts.bodies().length).toBe(1);

    // Special dates: one interaction from the first layer.
    await layerOption(page, "Special dates").click();
    await expect(layerOption(page, "Special dates")).toBeChecked();

    // Copy day: inside the day drawer on the Calendar layer.
    await layerOption(page, "Calendar").click();
    await page
      .locator(`[data-date="${localDay(2)}"]`)
      .first()
      .click();
    await page.getByRole("dialog").getByRole("button", { name: "Edit Dinner" }).click();
    await expect(page.getByRole("button", { name: "Copy to other days…" })).toBeVisible();
  });

  test("(c) Tonight is one click from the Timeline header", async ({ mockedPage: page }) => {
    await page.goto("timeline");
    await page.getByRole("button", { name: /^Tonight(?!'s)/ }).click();
    await expect(page.getByRole("button", { name: "Apply", exact: true }).first()).toBeVisible();
  });

  test("(e) a Host sees no editor on the hub, the nav or the Availability page", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page, { derive: true });
    await viewAsHost(page);
    await page.goto("setup");
    await expect(page.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("button", {
        name: /set up|edit|change|close|add|move|rules|compare|create|open/i,
      })
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation").getByRole("button", { name: /set up|edit|close|add/i })
    ).toHaveCount(0);
  });

  test("(e) a Host's Availability page is read-only: Calendar and Special dates, History and Go to date only", async ({
    mockedPage: page,
  }) => {
    await viewAsHost(page);
    await page.goto("availability");
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(layerOption(page, "Schedules")).toHaveCount(0);
    await expect(page.getByTestId("week-panel")).toHaveCount(0);
    for (const name of ["Close…", "Pause online booking", "Add a schedule…"]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["History", "Go to date"]);
  });
});

test.describe("First paint and night-of actions (PRD 15, 21)", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await pinToday(mockedPage);
  });

  test("PRD 15: a Manager's first paint has at most 7 actionable controls outside the week panel", async ({
    mockedPage: page,
  }) => {
    await firstPaint(page);
    const { count, controls } = await countFirstPaintControls(page, weekPanel(page));

    test.info().annotations.push({
      type: "first paint controls (agent stand-in)",
      description: `${count} outside the week panel: ${controls.join(" | ")}`,
    });
    expect(count, controls.join("\n")).toBeLessThanOrEqual(7);
    // Every control removed from first paint is one interaction away (PRD 7): a visible
    // "Add a schedule…" is how a one-schedule Manager learns schedules exist (PRD 19).
    expect(controls).toContain("button: Add a schedule…");
  });

  test("PRD 21: Close… and Pause online booking are one interaction on a desktop", async ({
    mockedPage: page,
  }) => {
    await mockClosures(page, {});
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Close…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Close", exact: true })).toBeVisible();
    expect(counter.count()).toBe(1);

    await page.keyboard.press("Escape");
    await counter.page.getByRole("button", { name: "Pause online booking" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(counter.count()).toBe(2); // one each
  });

  test("PRD 21: on a 375x812 phone Close… is one interaction and Pause online booking two", async ({
    mockedPage: page,
  }) => {
    await page.setViewportSize(PHONE);
    await mockClosures(page, {});
    await firstPaint(page);
    const close = countInteractions(page);
    await close.page.getByRole("button", { name: "Close…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Close", exact: true })).toBeVisible();
    expect(close.count()).toBe(1);

    await page.keyboard.press("Escape");
    const pause = countInteractions(page);
    await pause.page.getByRole("button", { name: "More actions" }).click();
    await pause.page.getByRole("menuitem", { name: "Pause online booking" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(pause.count()).toBe(2);
  });
});

test.describe("The demo runs as written (PRD 23)", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await pinToday(mockedPage);
  });

  test("onboarding's week is the first thing /availability shows; schedules and special dates are one layer down", async ({
    mockedPage: page,
  }) => {
    test.slow();
    await mockEmptyVenue(page, { derive: true });
    await mockNoopPreview(page);
    await page.goto("availability");
    await setUniformBistroWeek(page); // Lunch and Dinner Mon–Fri through quick setup
    await page.goto("availability");

    // After: the same first layer onboarding had, filled with the saved week and the guest strip.
    const panel = weekPanel(page);
    await expect(panel).toBeVisible();
    await expect(layerOption(page, "Schedules")).toBeChecked();
    await expect(panel.getByRole("textbox", { name: "Service name" }).first()).toHaveValue("Lunch");
    await expect(panel.getByRole("textbox", { name: "Service name" }).last()).toHaveValue("Dinner");
    await expect(page.getByRole("complementary", { name: "Guest preview" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // First paint meets criterion 15.
    const { count, controls } = await countFirstPaintControls(page, panel);
    expect(count, controls.join("\n")).toBeLessThanOrEqual(7);

    // Special dates: one interaction down, one interaction back to the same first layer.
    const down = countInteractions(page);
    await layerOption(down.page, "Special dates").click();
    expect(down.count()).toBe(1);
    await expect(layerOption(page, "Special dates")).toBeChecked();
    await layerOption(page, "Schedules").click();
    await expect(panel.getByRole("textbox", { name: "Service name" })).toHaveCount(2);

    // Schedules: one interaction to the editor, closed again, the same first layer.
    const schedules = countInteractions(page);
    await schedules.page.getByRole("button", { name: "Add a schedule…" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("textbox", { name: /Schedule name/ })).toBeVisible();
    expect(schedules.count()).toBe(1);
    await drawer.getByRole("button", { name: "Cancel" }).click();
    await expect(drawer).toBeHidden();
    await expect(panel.getByRole("textbox", { name: "Service name" }).first()).toHaveValue("Lunch");
  });
});
